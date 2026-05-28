import type {
  DroxRpcClient,
  RpcRequestHandler,
  RpcRequestResult,
} from "./droxRpcClient";

/**
 * Paramètres reçus du serveur dans une requête `tool/exec`. Doit rester en
 * phase avec `ToolExecParams` côté Rust (cf. `drox-cli/src/jsonrpc/protocol.rs`).
 */
export interface ToolExecParams {
  runId: string;
  callId: string;
  toolName: string;
  input: unknown;
  workspace: string;
  planMode?: boolean;
  applyFsWrites?: boolean;
}

/**
 * Résultat à renvoyer dans la `Response` à `tool/exec`. `isError: true`
 * signale au modèle (via le moteur) que l'opération a échoué.
 */
export interface ToolExecResult {
  output: unknown;
  isError?: boolean;
}

/** Implémentation d'un tool côté client. */
export type ClientToolHandler = (
  params: ToolExecParams,
) => Promise<ToolExecResult>;

/**
 * Dispatcher des tools exécutés côté VS Code. `file_write`, `file_edit`,
 * `notebook_edit`, `bash` et `lsp` sont branchés.
 */
export class ClientToolRegistry {
  private readonly handlers = new Map<string, ClientToolHandler>();

  register(name: string, handler: ClientToolHandler): void {
    this.handlers.set(name, handler);
  }

  unregister(name: string): void {
    this.handlers.delete(name);
  }

  executableToolNames(): string[] {
    return Array.from(this.handlers.keys()).sort();
  }

  /**
   * Construit le handler JSON-RPC `tool/exec` à enregistrer sur le client.
   * Si le tool est inconnu (le moteur l'a délégué alors qu'on ne l'a pas
   * déclaré), on renvoie un `isError: true` plutôt qu'une erreur JSON-RPC,
   * pour que le modèle puisse récupérer côté agent loop.
   */
  toRequestHandler(): RpcRequestHandler {
    return async (rawParams) => {
      const p = rawParams as ToolExecParams | undefined;
      if (!p || typeof p.toolName !== "string") {
        return {
          error: {
            code: -32602,
            message: "tool/exec: missing or invalid params",
          },
        } satisfies RpcRequestResult;
      }
      const handler = this.handlers.get(p.toolName);
      if (!handler) {
        return {
          result: {
            output: {
              error: `tool not implemented by client: ${p.toolName}`,
              hint:
                "extension VS Code annonçant ce tool mais sans handler — incohérence interne",
            },
            isError: true,
          } satisfies ToolExecResult,
        };
      }
      try {
        const out = await handler(p);
        return { result: out };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          result: {
            output: { error: message },
            isError: true,
          } satisfies ToolExecResult,
        };
      }
    };
  }
}

/**
 * Branche le dispatcher sur le client RPC. À appeler **avant** `initialize()`
 * pour que les premières requêtes `tool/exec` soient déjà routées.
 */
export function attachClientTools(
  client: DroxRpcClient,
  registry: ClientToolRegistry,
): void {
  client.setRequestHandler("tool/exec", registry.toRequestHandler());
}
