/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { VSBuffer } from '../../../../base/common/buffer.js';

import { dirname } from '../../../../base/common/resources.js';

import { URI } from '../../../../base/common/uri.js';

import { generateUuid } from '../../../../base/common/uuid.js';

import { IFileService } from '../../../../platform/files/common/files.js';

import { droxEmbedText } from '../common/droxEmbeddings.js';

import {

	IDroxLongMemoryDbV1,

	IDroxSessionCloseResult,

	IDroxSessionSearchHit,

	IDroxSessionSearchResult,

	IDroxStoredContextChunk,

	IDroxStoredSessionClosure,

} from '../common/droxLongMemory.js';

import { IDroxSessionCompactResult } from '../common/droxSessionCompact.js';



function emptyDb(): IDroxLongMemoryDbV1 {

	return { version: 1, contextChunks: [], sessionClosures: [] };

}



function asString(v: unknown): string {

	return typeof v === 'string' ? v : v == null ? '' : String(v);

}



function asNumber(v: unknown): number {

	const n = typeof v === 'number' ? v : Number(v);

	return Number.isFinite(n) ? n : 0;

}



function asStringArray(v: unknown): string[] {

	if (!Array.isArray(v)) {

		return [];

	}

	return v.map(x => (typeof x === 'string' ? x : String(x)));

}



function dotProduct(a: number[], b: number[]): number {

	if (a.length !== b.length || a.length === 0) {

		return -1;

	}

	let s = 0;

	for (let i = 0; i < a.length; i++) {

		s += a[i]! * b[i]!;

	}

	return s;

}



function lexicalScore(query: string, text: string): number {

	const q = query.toLowerCase().trim();

	if (!q || !text) {

		return 0;

	}

	const low = text.toLowerCase();

	if (low.includes(q)) {

		return 0.35;

	}

	const words = q.split(/\s+/).filter(w => w.length > 1);

	if (words.length === 0) {

		return 0;

	}

	let hit = 0;

	for (const w of words) {

		if (low.includes(w)) {

			hit++;

		}

	}

	return 0.15 * (hit / words.length);

}



function snippetFrom(text: string, maxLen = 700): string {

	const t = text.replace(/\s+/g, ' ').trim();

	if (t.length <= maxLen) {

		return t;

	}

	return `${t.slice(0, maxLen)}…`;

}



export class DroxLongMemoryStore {



	constructor(

		private readonly dbUri: URI,

		private readonly fileService: IFileService,

	) { }



	static dbUriForWorkspace(workspaceUri: URI): URI {

		return URI.joinPath(workspaceUri, '.drox', 'long-memory', 'db.json');

	}



	private async load(): Promise<IDroxLongMemoryDbV1> {

		try {

			const file = await this.fileService.readFile(this.dbUri);

			const parsed = JSON.parse(file.value.toString()) as IDroxLongMemoryDbV1;

			if (parsed?.version === 1 && Array.isArray(parsed.contextChunks)) {

				return parsed;

			}

		} catch {

			// absent or unreadable

		}

		return emptyDb();

	}



	private async save(db: IDroxLongMemoryDbV1): Promise<void> {

		await this.fileService.createFolder(dirname(this.dbUri));

		await this.fileService.writeFile(this.dbUri, VSBuffer.fromString(JSON.stringify(db, null, 2)));

	}



	async ingestContextChunkSummary(raw: Record<string, unknown>): Promise<void> {

		const summaryText = asString(raw.summaryText ?? raw.summary_text);

		const embedding = await droxEmbedText(summaryText);

		const row: IDroxStoredContextChunk = {

			schemaVersion: asNumber(raw.schemaVersion ?? raw.schema_version) || 1,

			id: asString(raw.id),

			workspaceFingerprint: asString(raw.workspaceFingerprint ?? raw.workspace_fingerprint),

			transcriptSessionId: asString(raw.transcriptSessionId ?? raw.transcript_session_id),

			createdAt: asString(raw.createdAt ?? raw.created_at),

			compactionSeq: asNumber(raw.compactionSeq ?? raw.compaction_seq),

			tokensBefore: asNumber(raw.tokensBefore ?? raw.tokens_before),

			tokensAfter: asNumber(raw.tokensAfter ?? raw.tokens_after),

			summaryText,

			filesTouched: asStringArray(raw.filesTouched ?? raw.files_touched),

			tagsSuggested: asStringArray(raw.tagsSuggested ?? raw.tags_suggested),

			checkpointMessageId: raw.checkpointMessageId != null

				? asString(raw.checkpointMessageId)

				: raw.checkpoint_message_id != null

					? asString(raw.checkpoint_message_id)

					: undefined,

			embedding,

		};

		if (!row.id || !row.transcriptSessionId) {

			return;

		}

		const db = await this.load();

		db.contextChunks.push(row);

		await this.save(db);

	}



	async ingestFromSessionCompact(

		workspaceFingerprint: string,

		transcriptSessionId: string,

		res: IDroxSessionCompactResult,

	): Promise<boolean> {

		const summaryText = res.summary.trim();

		if (!summaryText) {

			return false;

		}

		const db = await this.load();

		const maxSeq = db.contextChunks

			.filter(c => c.transcriptSessionId === transcriptSessionId)

			.reduce((m, c) => Math.max(m, c.compactionSeq), 0);

		const inputTok = res.usage?.inputTokens ?? 0;

		const outputTok = res.usage?.outputTokens ?? 0;

		await this.ingestContextChunkSummary({

			schemaVersion: 1,

			id: `ccs_manual_${generateUuid()}`,

			workspaceFingerprint,

			transcriptSessionId,

			createdAt: new Date().toISOString(),

			compactionSeq: maxSeq + 1,

			tokensBefore: inputTok,

			tokensAfter: Math.max(0, inputTok - outputTok),

			summaryText,

			filesTouched: res.filesTouched,

			tagsSuggested: [],

		});

		return true;

	}



	async listChunksForSession(transcriptSessionId: string): Promise<IDroxStoredContextChunk[]> {

		const db = await this.load();

		return db.contextChunks

			.filter(c => c.transcriptSessionId === transcriptSessionId)

			.sort((a, b) => a.compactionSeq - b.compactionSeq);

	}



	async closeSession(params: {

		transcriptSessionId: string;

		farewellHint?: string;

	}): Promise<IDroxSessionCloseResult> {

		const chunks = await this.listChunksForSession(params.transcriptSessionId);

		const ids = chunks.map(c => c.id);

		const body = chunks.map(c => c.summaryText).join('\n\n---\n\n');

		const hint = params.farewellHint?.trim();

		const summaryGlobal = hint ? `${body}\n\n[Indication au revoir]\n${hint}` : body;

		const emb = await droxEmbedText(summaryGlobal.slice(0, 12000));

		const closureId = `sc_${generateUuid()}`;

		const closure: IDroxStoredSessionClosure = {

			schemaVersion: 1,

			id: closureId,

			transcriptSessionId: params.transcriptSessionId,

			closedAt: new Date().toISOString(),

			summaryGlobal,

			contextChunkIds: ids,

			embedding: emb,

		};

		const db = await this.load();

		db.sessionClosures.push(closure);

		db.contextChunks = db.contextChunks.filter(c => c.transcriptSessionId !== params.transcriptSessionId);

		await this.save(db);

		return { closureId, chunkCount: ids.length };

	}



	async searchMemories(params: { query: string; limit?: number }): Promise<IDroxSessionSearchResult> {

		const limit = Math.min(25, Math.max(1, params.limit ?? 8));

		const query = params.query.trim();

		const db = await this.load();

		const qVec = await droxEmbedText(query);

		const byId = new Map<string, IDroxSessionSearchHit>();



		const upsert = (h: IDroxSessionSearchHit): void => {

			const prev = byId.get(h.id);

			if (!prev || prev.score < h.score) {

				byId.set(h.id, h);

			}

		};



		if (qVec) {

			for (const c of db.contextChunks) {

				if (c.embedding?.length === qVec.length) {

					const score = dotProduct(qVec, c.embedding);

					if (score > 0.05) {

						upsert({

							kind: 'context_chunk',

							id: c.id,

							score,

							match: 'embedding',

							transcriptSessionId: c.transcriptSessionId,

							snippet: snippetFrom(c.summaryText),

							createdAt: c.createdAt,

							compactionSeq: c.compactionSeq,

						});

					}

				}

			}

			for (const cl of db.sessionClosures) {

				if (cl.embedding?.length === qVec.length) {

					const score = dotProduct(qVec, cl.embedding);

					if (score > 0.05) {

						upsert({

							kind: 'session_closure',

							id: cl.id,

							score,

							match: 'embedding',

							transcriptSessionId: cl.transcriptSessionId,

							snippet: snippetFrom(cl.summaryGlobal),

							closedAt: cl.closedAt,

						});

					}

				}

			}

		}



		for (const c of db.contextChunks) {

			const s = lexicalScore(query, c.summaryText);

			if (s > 0) {

				upsert({

					kind: 'context_chunk',

					id: c.id,

					score: s,

					match: 'lexical',

					transcriptSessionId: c.transcriptSessionId,

					snippet: snippetFrom(c.summaryText),

					createdAt: c.createdAt,

					compactionSeq: c.compactionSeq,

				});

			}

		}

		for (const cl of db.sessionClosures) {

			const s = lexicalScore(query, cl.summaryGlobal);

			if (s > 0) {

				upsert({

					kind: 'session_closure',

					id: cl.id,

					score: s,

					match: 'lexical',

					transcriptSessionId: cl.transcriptSessionId,

					snippet: snippetFrom(cl.summaryGlobal),

					closedAt: cl.closedAt,

				});

			}

		}



		const hits = Array.from(byId.values())

			.sort((a, b) => b.score - a.score)

			.slice(0, limit);



		return { hits, usedEmbedding: qVec != null };

	}

}

