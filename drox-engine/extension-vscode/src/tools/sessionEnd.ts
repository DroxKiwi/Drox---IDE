import type { ToolExecParams, ToolExecResult } from "../clientTools";
import type { LongMemoryStore } from "../longMemoryStore";

export interface SessionEndHandlerOptions {
  getSessionId: () => string | undefined;
  store: LongMemoryStore;
  onStored: () => void;
}

/**
 * Agrège les `context_chunk_summary` de la session courante, écrit une
 * `session_closure` + embedding, puis signale au provider qu'il faudra
 * réinitialiser le chat à la fin du run (`agent/done`).
 */
export function createSessionEndHandler(
  opts: SessionEndHandlerOptions,
): (params: ToolExecParams) => Promise<ToolExecResult> {
  return async (_params: ToolExecParams) => {
    const sessionId = opts.getSessionId();
    if (!sessionId) {
      return {
        output: {
          error:
            "session_end: aucun sessionId actif — impossible de clôturer (envoyez un message utilisateur d'abord).",
        },
        isError: true,
      };
    }
    try {
      const input = (_params.input ?? {}) as { farewell_hint?: string; farewellHint?: string };
      const farewellHint = input.farewellHint ?? input.farewell_hint;
      const { closureId, chunkCount } = await opts.store.closeSession({
        transcriptSessionId: sessionId,
        farewellHint,
      });
      opts.onStored();
      return {
        output: {
          closureId,
          chunkCount,
          stored: true,
          resetAfterRun: true,
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
