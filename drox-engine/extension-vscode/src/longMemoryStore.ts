import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type * as vscode from "vscode";

import { embedText } from "./embeddings";

export interface StoredContextChunk {
  schemaVersion: number;
  id: string;
  workspaceFingerprint: string;
  transcriptSessionId: string;
  createdAt: string;
  compactionSeq: number;
  tokensBefore: number;
  tokensAfter: number;
  summaryText: string;
  filesTouched: string[];
  tagsSuggested: string[];
  checkpointMessageId?: string;
  embedding: number[] | null;
}

export interface StoredSessionClosure {
  schemaVersion: number;
  id: string;
  transcriptSessionId: string;
  closedAt: string;
  summaryGlobal: string;
  contextChunkIds: string[];
  memorySessionSlug?: string;
  embedding: number[] | null;
}

/** Un résultat de `session_search` (outil côté client). */
export interface SessionSearchHit {
  kind: "context_chunk" | "session_closure";
  id: string;
  score: number;
  match: "embedding" | "lexical";
  transcriptSessionId: string;
  snippet: string;
  createdAt?: string;
  closedAt?: string;
  compactionSeq?: number;
}

interface LongMemoryDbV1 {
  version: 1;
  contextChunks: StoredContextChunk[];
  sessionClosures: StoredSessionClosure[];
}

function emptyDb(): LongMemoryDbV1 {
  return { version: 1, contextChunks: [], sessionClosures: [] };
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.map((x) => (typeof x === "string" ? x : String(x)));
}

function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return -1;
  }
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i] * b[i];
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
  const words = q.split(/\s+/).filter((w) => w.length > 1);
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
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) {
    return t;
  }
  return `${t.slice(0, maxLen)}…`;
}

/** Stockage fichier JSON sous `globalStorageUri/long-memory/<hash>/db.json`. */
export class LongMemoryStore {
  private constructor(private readonly dbPath: string) {}

  static async open(
    extensionContext: vscode.ExtensionContext,
    workspaceRoot: string,
  ): Promise<LongMemoryStore> {
    const hash = crypto.createHash("sha256").update(workspaceRoot).digest("hex").slice(0, 32);
    const dir = path.join(extensionContext.globalStorageUri.fsPath, "long-memory", hash);
    await fs.mkdir(dir, { recursive: true });
    return new LongMemoryStore(path.join(dir, "db.json"));
  }

  private async load(): Promise<LongMemoryDbV1> {
    try {
      const raw = await fs.readFile(this.dbPath, "utf8");
      const parsed = JSON.parse(raw) as LongMemoryDbV1;
      if (parsed?.version === 1 && Array.isArray(parsed.contextChunks)) {
        return parsed;
      }
    } catch {
      // absent ou illisible
    }
    return emptyDb();
  }

  private async save(db: LongMemoryDbV1): Promise<void> {
    await fs.writeFile(this.dbPath, JSON.stringify(db, null, 2), "utf8");
  }

  /**
   * Enregistre un `context_chunk_summary` émis par le moteur après compaction live.
   * `raw` = objet JSON (champs camelCase issus de serde).
   */
  async ingestContextChunkSummary(raw: Record<string, unknown>): Promise<void> {
    const summaryText = asString(raw.summaryText ?? raw.summary_text);
    const embedding = await embedText(summaryText);
    const row: StoredContextChunk = {
      schemaVersion: asNumber(raw.schemaVersion ?? raw.schema_version) || 1,
      id: asString(raw.id),
      workspaceFingerprint: asString(raw.workspaceFingerprint ?? raw.workspace_fingerprint),
      transcriptSessionId: asString(
        raw.transcriptSessionId ?? raw.transcript_session_id,
      ),
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

  /**
   * Enregistre le résumé d’un `session.compact` manuel (slash ou outil) comme
   * chunk de contexte, aligné sur les segments issus de `context_compacted`.
   */
  async ingestFromSessionCompact(input: {
    transcriptSessionId: string;
    workspaceFingerprint: string;
    summary: string;
    filesTouched?: string[];
    usage?: { inputTokens: number; outputTokens: number };
  }): Promise<boolean> {
    const summaryText = input.summary.trim();
    if (!summaryText) {
      return false;
    }
    const db = await this.load();
    const maxSeq = db.contextChunks
      .filter((c) => c.transcriptSessionId === input.transcriptSessionId)
      .reduce((m, c) => Math.max(m, c.compactionSeq), 0);
    const compactionSeq = maxSeq + 1;
    const inputTok = input.usage?.inputTokens ?? 0;
    const outputTok = input.usage?.outputTokens ?? 0;
    const tokensBefore = inputTok;
    const tokensAfter = Math.max(0, inputTok - outputTok);
    await this.ingestContextChunkSummary({
      schemaVersion: 1,
      id: `ccs_manual_${crypto.randomUUID()}`,
      workspaceFingerprint: input.workspaceFingerprint,
      transcriptSessionId: input.transcriptSessionId,
      createdAt: new Date().toISOString(),
      compactionSeq,
      tokensBefore,
      tokensAfter,
      summaryText,
      filesTouched: input.filesTouched ?? [],
      tagsSuggested: [],
    });
    return true;
  }

  async listChunksForSessionAsync(transcriptSessionId: string): Promise<StoredContextChunk[]> {
    const db = await this.load();
    return db.contextChunks
      .filter((c) => c.transcriptSessionId === transcriptSessionId)
      .sort((a, b) => a.compactionSeq - b.compactionSeq);
  }

  async closeSession(params: {
    transcriptSessionId: string;
    farewellHint?: string;
  }): Promise<{ closureId: string; chunkCount: number }> {
    const chunks = await this.listChunksForSessionAsync(params.transcriptSessionId);
    const ids = chunks.map((c) => c.id);
    const body = chunks.map((c) => c.summaryText).join("\n\n---\n\n");
    const hint = params.farewellHint?.trim();
    const summaryGlobal = hint ? `${body}\n\n[Indication au revoir]\n${hint}` : body;

    const emb = await embedText(summaryGlobal.slice(0, 12000));
    const closureId = `sc_${crypto.randomUUID()}`;
    const closure: StoredSessionClosure = {
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
    db.contextChunks = db.contextChunks.filter(
      (c) => c.transcriptSessionId !== params.transcriptSessionId,
    );
    await this.save(db);
    return { closureId, chunkCount: ids.length };
  }

  /**
   * Recherche dans les chunks actifs et les clôtures de session (cosinus sur
   * embeddings + repli lexical sur le texte).
   */
  async searchMemories(params: {
    query: string;
    limit?: number;
  }): Promise<{ hits: SessionSearchHit[]; usedEmbedding: boolean }> {
    const limit = Math.min(25, Math.max(1, params.limit ?? 8));
    const query = params.query.trim();
    const db = await this.load();
    const qVec = await embedText(query);
    const byId = new Map<string, SessionSearchHit>();

    const upsert = (h: SessionSearchHit): void => {
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
              kind: "context_chunk",
              id: c.id,
              score,
              match: "embedding",
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
              kind: "session_closure",
              id: cl.id,
              score,
              match: "embedding",
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
          kind: "context_chunk",
          id: c.id,
          score: s,
          match: "lexical",
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
          kind: "session_closure",
          id: cl.id,
          score: s,
          match: "lexical",
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
