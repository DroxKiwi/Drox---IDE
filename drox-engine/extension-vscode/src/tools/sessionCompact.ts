import * as vscode from "vscode";

import type { ToolExecParams, ToolExecResult } from "../clientTools";
import type { DroxRpcClient, SessionCompactResult } from "../droxRpcClient";

/**
 * Appelle `session.compact` sur le transcript JSONL courant (équivalent `/compact`).
 */
export function createSessionCompactHandler(opts: {
  getClient: () => DroxRpcClient | undefined;
  getSessionId: () => string | undefined;
  /** Après compaction réussie : ex. ingestion mémoire longue côté extension. */
  onCompactSuccess?: (
    workspace: string,
    sessionId: string,
    res: SessionCompactResult,
  ) => Promise<void>;
}): (params: ToolExecParams) => Promise<ToolExecResult> {
  return async (params: ToolExecParams) => {
    const client = opts.getClient();
    if (!client) {
      return {
        output: { error: "session_compact: client RPC non connecté." },
        isError: true,
      };
    }
    const sid = opts.getSessionId();
    if (!sid) {
      return {
        output: {
          error:
            "session_compact: pas de sessionId actif — envoyez d'abord un message dans ce fil.",
        },
        isError: true,
      };
    }
    const ws = params.workspace;
    const cfg = vscode.workspace.getConfiguration("drox", vscode.Uri.file(ws));
    const server = (cfg.get<string>("server") ?? "").trim() || undefined;
    const model = (cfg.get<string>("model") ?? "").trim() || undefined;
    const apiKey = (cfg.get<string>("apiKey") ?? "").trim() || undefined;
    try {
      const res = await client.sessionCompact({
        id: sid,
        server,
        model,
        apiKey,
      });
      if (opts.onCompactSuccess) {
        await opts.onCompactSuccess(ws, sid, res);
      }
      return {
        output: {
          objective: res.objective ?? null,
          summary: res.summary,
          files_touched: res.filesTouched,
          usage: res.usage,
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
