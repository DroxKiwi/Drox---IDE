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
import { DroxCodebaseIndexPipelineEmitter } from './droxCodebaseIndexPipelineEmit.js';

const EMBED_BATCH_SIZE = 32;

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
}

export async function droxCodebaseMergeEmbed(
	deps: IDroxCodebaseIndexEmbedDeps,
	needEmbed: readonly IDroxCodebaseChunk[],
	reusedVectors: readonly IDroxCodebaseVectorRow[],
	fallbackModelPath: string | undefined,
): Promise<{ vectors: IDroxCodebaseVectorRow[]; dimensions: number; modelPath: string } | undefined> {
	const { pipeline } = deps;
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
		const vectors: IDroxCodebaseVectorRow[] = [];
		let dimensions = 0;
		const totalBatches = Math.ceil(chunks.length / EMBED_BATCH_SIZE);
		for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
			const batchIndex = Math.floor(i / EMBED_BATCH_SIZE) + 1;
			const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
			const texts = batch.map(c => c.text.slice(0, 2000));
			const pct = 68 + Math.round((batchIndex / Math.max(1, totalBatches)) * 20);
			pipeline.emit('embed_batch', 'running', `Encode batch ${batchIndex}/${totalBatches} (${batch.length} chunks)`, {
				detail: { progressPct: pct, batch: batchIndex, batches: totalBatches },
			});
			const encoded = await embedClient.encode(texts);
			for (let j = 0; j < batch.length; j++) {
				const values = encoded.vectors[j]?.values ?? [];
				if (!values.length) {
					continue;
				}
				dimensions = values.length;
				const chunk = batch[j]!;
				vectors.push({
					chunkId: chunk.id,
					path: chunk.path,
					startLine: chunk.startLine,
					endLine: chunk.endLine,
					preview: chunk.text.slice(0, 160).replace(/\s+/g, ' '),
					values: [...values],
				});
			}
		}
		if (!vectors.length) {
			pipeline.emit('embed_batch', 'warn', 'Encode returned no vectors', { detail: { progressPct: 88 } });
			return undefined;
		}
		pipeline.emit('embed_batch', 'ok', `Encoded ${vectors.length} vectors (${dimensions} dims)`, {
			detail: { progressPct: 88, vectors: vectors.length, dimensions },
		});
		return { vectors, dimensions, modelPath };
	} catch (err) {
		logService.warn(`[drox-codebase] embed encode skipped: ${err}`);
		pipeline.emit('embed_batch', 'error', `Encode error: ${err}`, { detail: { progressPct: 70 } });
		return undefined;
	}
}
