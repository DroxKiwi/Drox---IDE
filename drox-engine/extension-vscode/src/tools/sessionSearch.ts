import type { ToolExecParams, ToolExecResult } from "../clientTools";
import type { LongMemoryStore } from "../longMemoryStore";

export function createSessionSearchHandler(store: LongMemoryStore) {
  return async (params: ToolExecParams): Promise<ToolExecResult> => {
    const raw = (params.input ?? {}) as {
      query?: string;
      limit?: number;
    };
    const query = typeof raw.query === "string" ? raw.query.trim() : "";
    if (!query) {
      return {
        output: { error: "session_search: le champ `query` (string non vide) est requis." },
        isError: true,
      };
    }
    const limit =
      typeof raw.limit === "number" && Number.isFinite(raw.limit)
        ? Math.floor(raw.limit)
        : undefined;
    try {
      const { hits, usedEmbedding } = await store.searchMemories({ query, limit });
      return {
        output: {
          query,
          hitCount: hits.length,
          usedEmbedding,
          hits,
        },
        isError: false,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        output: { error: message },
        isError: true,
      };
    }
  };
}
