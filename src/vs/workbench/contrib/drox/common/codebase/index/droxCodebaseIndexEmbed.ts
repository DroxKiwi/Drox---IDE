/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IDroxCodebaseChunk } from '../droxCodebaseChunker.js';
import { DroxCodebaseEmbedClient } from '../droxCodebaseEmbedClient.js';
import { resolveDroxEmbedModelPath } from '../droxCodebaseEmbedPaths.js';
import { IDroxCodebaseVectorRow } from '../droxCodebaseHybrid.js';
import {
	IDroxEmbedChunkIssue,
	IDroxEmbedPreparedChunk,
	isEmbedNulByteError,
	prepareChunkForEmbed,
} from './droxCodebaseEmbedSanitize.js';
import { DroxCodebaseIndexPipelineEmitter } from './droxCodebaseIndexPipelineEmit.js';

const EMBED_BATCH_SIZE = 32;
/** Cap per-path warn lines in the pipeline journal (summary still lists totals). */
const MAX_ISSUE_LOG_LINES = 12;

export interface IDroxCodebaseEmbedResolveOpts {
	readonly customPath?: string;
	readonly appRoot?: string;
	readonly userDataPath?: string;
}

export interface IDroxCodebaseIndexEmbedDeps {
	readonly fileService: IFileService;
	readonly logService: ILogService;
	readonly embedClient: DroxCodebaseEmbedClient;
	readonly pipeline: DroxCodebaseIndexPipelineEmitter;
	readonly resolveOpts: IDroxCodebaseEmbedResolveOpts;
	/** When false, skip encode; keep reused vectors for store continuity. */
	readonly embedEnabled?: boolean;
}

export async function droxCodebaseMergeEmbed(
	deps: IDroxCodebaseIndexEmbedDeps,
	needEmbed: readonly IDroxCodebaseChunk[],
	reusedVectors: readonly IDroxCodebaseVectorRow[],
	fallbackModelPath: string | undefined,
): Promise<{ vectors: IDroxCodebaseVectorRow[]; dimensions: number; modelPath: string } | undefined> {
	const { pipeline } = deps;
	if (deps.embedEnabled === false) {
		pipeline.emit('embed_batch', 'ok', 'Embed disabled — lexical-only (kept reused vectors)', {
			detail: { progressPct: 85, reusedVectors: reusedVectors.length, needEmbed: needEmbed.length },
		});
		if (!reusedVectors.length) {
			return undefined;
		}
		return {
			vectors: [...reusedVectors],
			dimensions: reusedVectors[0]!.values.length,
			modelPath: fallbackModelPath ?? 'disabled',
		};
	}
	if (!needEmbed.length) {
		if (!reusedVectors.length) {
			pipeline.emit('embed_batch', 'ok', 'Embed skipped — nothing new to encode (reused vectors only or lexical)', {
				detail: { progressPct: 80, reusedVectors: 0 },
			});
			return undefined;
		}
		const modelPath = await resolveDroxEmbedModelPath(deps.fileService, deps.resolveOpts)
			?? fallbackModelPath
			?? 'local';
		pipeline.emit('embed_batch', 'ok', `Reused ${reusedVectors.length} vectors (no re-encode)`, {
			detail: { progressPct: 85, reusedVectors: reusedVectors.length },
		});
		return {
			vectors: [...reusedVectors],
			dimensions: reusedVectors[0]!.values.length,
			modelPath,
		};
	}
	const embedded = await droxCodebaseTryEmbedChunks(deps, needEmbed);
	if (!embedded) {
		if (!reusedVectors.length) {
			pipeline.emit('embed_batch', 'warn', 'Embed unavailable — lexical-only for new chunks', {
				detail: { progressPct: 85, needEmbed: needEmbed.length },
			});
			return undefined;
		}
		pipeline.emit('embed_batch', 'warn', `Embed failed for new chunks — kept ${reusedVectors.length} old vectors`, {
			detail: { progressPct: 85, reusedVectors: reusedVectors.length },
		});
		return {
			vectors: [...reusedVectors],
			dimensions: reusedVectors[0]!.values.length,
			modelPath: fallbackModelPath ?? 'local',
		};
	}
	return {
		vectors: [...reusedVectors, ...embedded.vectors],
		dimensions: embedded.dimensions,
		modelPath: embedded.modelPath,
	};
}

export async function droxCodebaseTryEmbedChunks(
	deps: {
		readonly fileService: IFileService;
		readonly logService: ILogService;
		readonly embedClient: DroxCodebaseEmbedClient;
		readonly pipeline: DroxCodebaseIndexPipelineEmitter;
		readonly resolveOpts: IDroxCodebaseEmbedResolveOpts;
	},
	chunks: readonly IDroxCodebaseChunk[],
): Promise<{ vectors: IDroxCodebaseVectorRow[]; dimensions: number; modelPath: string } | undefined> {
	if (!chunks.length) {
		return undefined;
	}
	const { embedClient, pipeline, logService, fileService, resolveOpts } = deps;
	try {
		const st = await embedClient.status();
		if (!st.built) {
			pipeline.emit('embed_load', 'warn', 'Embed runtime not built in drox.exe', { detail: { progressPct: 60 } });
			return undefined;
		}
		let modelPath = st.modelPath;
		if (!st.modelLoaded || !modelPath) {
			pipeline.emit('embed_load', 'running', 'Loading MiniLM GGUF…', { detail: { progressPct: 60 } });
			modelPath = await resolveDroxEmbedModelPath(fileService, resolveOpts);
			if (!modelPath) {
				logService.info('[drox-codebase] embed built but no GGUF found — lexical-only index');
				pipeline.emit('embed_load', 'warn', 'No GGUF found — lexical-only', { detail: { progressPct: 65 } });
				return undefined;
			}
			await embedClient.load(modelPath);
			pipeline.emit('embed_load', 'ok', `Model loaded`, { path: modelPath, detail: { progressPct: 68 } });
		} else {
			pipeline.emit('embed_load', 'ok', `Model already loaded`, { path: modelPath, detail: { progressPct: 68 } });
		}

		const prepared = chunks.map(c => prepareChunkForEmbed({
			id: c.id,
			path: c.path,
			startLine: c.startLine,
			endLine: c.endLine,
			text: c.text,
		}));
		const issues: IDroxEmbedChunkIssue[] = [];
		for (const p of prepared) {
			issues.push(...p.issues);
		}
		const toEncode = prepared.filter(p => !p.skipEncode);
		emitPreparedIssueEvents(pipeline, prepared);

		const vectors: IDroxCodebaseVectorRow[] = [];
		let dimensions = 0;
		const totalBatches = Math.max(1, Math.ceil(toEncode.length / EMBED_BATCH_SIZE));

		for (let i = 0; i < toEncode.length; i += EMBED_BATCH_SIZE) {
			const batchIndex = Math.floor(i / EMBED_BATCH_SIZE) + 1;
			const batch = toEncode.slice(i, i + EMBED_BATCH_SIZE);
			const pct = 68 + Math.round((batchIndex / totalBatches) * 20);
			pipeline.emit('embed_batch', 'running', `Encode batch ${batchIndex}/${totalBatches} (${batch.length} chunks)`, {
				detail: { progressPct: pct, batch: batchIndex, batches: totalBatches },
			});

			const batchResult = await encodeBatchResilient(embedClient, batch, logService);
			issues.push(...batchResult.issues);
			emitEncodeIssueEvents(pipeline, batchResult.issues);

			for (const row of batchResult.vectors) {
				dimensions = row.values.length;
				vectors.push(row);
			}
		}

		if (issues.length) {
			const uniquePaths = uniqueIssuePaths(issues);
			pipeline.emit('embed_batch', 'warn', `Embed partial — ${issues.length} issue(s) in ${uniquePaths.length} file(s); encoded ${vectors.length} vectors (pipeline continued)`, {
				detail: {
					progressPct: 88,
					vectors: vectors.length,
					skippedIssues: issues.length,
					skippedFiles: uniquePaths.length,
					partial: true,
				},
			});
		}

		if (!vectors.length) {
			pipeline.emit('embed_batch', 'warn', 'Encode returned no vectors (all chunks skipped or failed)', {
				detail: { progressPct: 88, skippedIssues: issues.length },
			});
			return undefined;
		}

		pipeline.emit('embed_batch', issues.length ? 'warn' : 'ok', `Encoded ${vectors.length} vectors (${dimensions} dims)${issues.length ? ` · ${issues.length} issue(s) surfaced` : ''}`, {
			detail: { progressPct: 88, vectors: vectors.length, dimensions, skippedIssues: issues.length },
		});
		return { vectors, dimensions, modelPath };
	} catch (err) {
		logService.warn(`[drox-codebase] embed encode skipped: ${err}`);
		pipeline.emit('embed_batch', 'error', `Encode error: ${err}`, { detail: { progressPct: 70 } });
		return undefined;
	}
}

async function encodeBatchResilient(
	embedClient: DroxCodebaseEmbedClient,
	batch: readonly IDroxEmbedPreparedChunk[],
	logService: ILogService,
): Promise<{ vectors: IDroxCodebaseVectorRow[]; issues: IDroxEmbedChunkIssue[] }> {
	const texts = batch.map(c => c.text);
	try {
		const encoded = await embedClient.encode(texts);
		return { vectors: rowsFromEncoded(batch, encoded.vectors), issues: [] };
	} catch (err) {
		logService.warn(`[drox-codebase] embed batch failed — retrying per chunk: ${err}`);
		const vectors: IDroxCodebaseVectorRow[] = [];
		const issues: IDroxEmbedChunkIssue[] = [];
		for (const chunk of batch) {
			try {
				const encoded = await embedClient.encode([chunk.text]);
				const values = encoded.vectors[0]?.values ?? [];
				if (!values.length) {
					issues.push({
						path: chunk.path,
						startLine: chunk.startLine,
						endLine: chunk.endLine,
						reason: 'encode_failed',
						guidance: 'Embed encode returned an empty vector. Exclude the file if it is not source text, then Reindex.',
					});
					continue;
				}
				vectors.push({
					chunkId: chunk.chunkId,
					path: chunk.path,
					startLine: chunk.startLine,
					endLine: chunk.endLine,
					preview: chunk.text.slice(0, 160).replace(/\s+/g, ' '),
					values: [...values],
				});
			} catch (chunkErr) {
				const reason = isEmbedNulByteError(chunkErr) ? 'null_byte' as const : 'encode_failed' as const;
				issues.push({
					path: chunk.path,
					startLine: chunk.startLine,
					endLine: chunk.endLine,
					reason,
					guidance: reason === 'null_byte'
						? 'File still contains NUL bytes after sanitize — exclude or fix the file, then Reindex.'
						: `Encode failed: ${chunkErr instanceof Error ? chunkErr.message : String(chunkErr)}. Exclude the file if it is not source text, then Reindex.`,
				});
			}
		}
		return { vectors, issues };
	}
}

function rowsFromEncoded(
	batch: readonly IDroxEmbedPreparedChunk[],
	vectors: readonly { readonly values: readonly number[] }[],
): IDroxCodebaseVectorRow[] {
	const out: IDroxCodebaseVectorRow[] = [];
	for (let j = 0; j < batch.length; j++) {
		const values = vectors[j]?.values ?? [];
		if (!values.length) {
			continue;
		}
		const chunk = batch[j]!;
		out.push({
			chunkId: chunk.chunkId,
			path: chunk.path,
			startLine: chunk.startLine,
			endLine: chunk.endLine,
			preview: chunk.text.slice(0, 160).replace(/\s+/g, ' '),
			values: [...values],
		});
	}
	return out;
}

function emitPreparedIssueEvents(
	pipeline: DroxCodebaseIndexPipelineEmitter,
	prepared: readonly IDroxEmbedPreparedChunk[],
): void {
	const rows: { issue: IDroxEmbedChunkIssue; action: 'sanitized' | 'skipped' }[] = [];
	for (const p of prepared) {
		for (const issue of p.issues) {
			rows.push({ issue, action: p.skipEncode ? 'skipped' : 'sanitized' });
		}
	}
	emitIssueRows(pipeline, rows);
}

function emitEncodeIssueEvents(
	pipeline: DroxCodebaseIndexPipelineEmitter,
	issues: readonly IDroxEmbedChunkIssue[],
): void {
	emitIssueRows(pipeline, issues.map(issue => ({ issue, action: 'skipped' as const })));
}

function emitIssueRows(
	pipeline: DroxCodebaseIndexPipelineEmitter,
	rows: readonly { issue: IDroxEmbedChunkIssue; action: 'sanitized' | 'skipped' }[],
): void {
	if (!rows.length) {
		return;
	}
	const byPath = new Map<string, { issue: IDroxEmbedChunkIssue; action: 'sanitized' | 'skipped' }>();
	for (const row of rows) {
		if (!byPath.has(row.issue.path)) {
			byPath.set(row.issue.path, row);
		}
	}
	let logged = 0;
	for (const row of byPath.values()) {
		if (logged >= MAX_ISSUE_LOG_LINES) {
			pipeline.emit('embed_batch', 'warn', `…and ${byPath.size - MAX_ISSUE_LOG_LINES} more file(s) with embed issues — see Alerts`, {
				detail: { embedIssue: true, skippedFiles: byPath.size },
			});
			break;
		}
		const { issue, action } = row;
		const label = action === 'sanitized' ? 'Embed sanitize' : 'Embed skip';
		pipeline.emit('embed_batch', 'warn', `${label} [${issue.reason}] ${issue.path}:${issue.startLine}-${issue.endLine} — ${issue.guidance}`, {
			path: issue.path,
			detail: {
				embedIssue: true,
				reason: issue.reason,
				action,
				startLine: issue.startLine,
				endLine: issue.endLine,
				guidance: issue.guidance,
			},
		});
		logged++;
	}
}

function uniqueIssuePaths(issues: readonly IDroxEmbedChunkIssue[]): string[] {
	return [...new Set(issues.map(i => i.path))];
}
