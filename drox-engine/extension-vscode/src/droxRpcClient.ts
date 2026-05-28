import * as readline from "node:readline";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";

/**
 * Message JSON-RPC reçu sur stdout. Trois formes possibles :
 *  - Response : `{ id, result? | error? }` (réponse à une de nos `request()`)
 *  - Notification serveur→client : `{ method, params? }` (sans `id`)
 *  - Requête serveur→client : `{ id, method, params? }` (depuis v1.1, ex. `tool/exec`)
 */
export type RpcIncoming =
  | { jsonrpc: "2.0"; id: number | string | null; result?: unknown; error?: RpcError }
  | { jsonrpc: "2.0"; id: number | string; method: string; params?: unknown }
  | { jsonrpc: "2.0"; method: string; params?: unknown };

export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** Résultat d'un handler de requête serveur→client. */
export type RpcRequestResult =
  | { result: unknown; error?: undefined }
  | { result?: undefined; error: RpcError };

/** Handler pour une requête serveur→client (ex. `tool/exec`). */
export type RpcRequestHandler = (params: unknown) => Promise<RpcRequestResult>;

export interface AgentRunImage {
  /** Type MIME (`image/png`, `image/jpeg`, `image/webp`, …). */
  mime: string;
  /** Base64 brute, sans préfixe `data:...;base64,`. */
  data: string;
}

export interface AgentRunParams {
  prompt: string;
  workspace?: string;
  server?: string;
  model?: string;
  applyEdits?: boolean;
  mode?: string;
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  headers?: Record<string, string>;
  sessionId?: string;
  sessionDir?: string;
  /**
   * Pièces jointes image transmises au modèle (input multimodal). Pour Ollama,
   * seul `data` est utilisé (champ `images` sur le message user). Pour
   * Anthropic/OpenAI, `mime` est requis.
   */
  images?: AgentRunImage[];
  /** Active le flux *thinking* Ollama et la phase UI `internal_reasoning`. */
  nativeThinking?: boolean;
  /** Outils retirés du registre pour ce run (§2.17). */
  disabledTools?: string[];
  /** Si `false`, les outils MCP ne sont pas enregistrés. */
  mcpToolsEnabled?: boolean;
  /** Objectif verrouillé du run (§2.25). */
  runObjective?: string;
  /** Sous-agents `task` (§2.10). Absent ou `false` = désactivé. */
  subagentsEnabled?: boolean;
  subagentsMaxIterations?: number;
  subagentsMaxConcurrent?: number;
  /** Modèle dédié sous-agents ; vide = modèle principal. */
  subagentsModel?: string;
  /** Fenêtre Ollama `num_ctx` sous-agents (indépendante du parent). */
  subagentsNumCtx?: number;
  /** Fenêtre Ollama `num_ctx` du run parent. */
  numCtx?: number;
}

export interface SessionListEntry {
  id: string;
  modifiedSecs: number;
  sizeBytes: number;
}

export interface TranscriptMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | {
        type: "tool_result";
        tool_use_id: string;
        content: string;
        is_error?: boolean;
      }
  >;
}

/** Derniers compteurs barre de statut persistés avec la session (camelCase JSON-RPC). */
export interface SessionUiStatsSnapshot {
  totalIn: number;
  totalOut: number;
  ctx: number;
}

export interface SessionReadResponse {
  messages: TranscriptMessage[];
  uiStats?: SessionUiStatsSnapshot;
}

/** Résultat de `session.compact` (camelCase JSON-RPC). */
export interface SessionCompactResult {
  summary: string;
  objective?: string;
  filesTouched?: string[];
  usage?: { inputTokens: number; outputTokens: number };
}

export interface InitializeOptions {
  /**
   * Tools que ce client peut exécuter localement (FileWrite/FileEdit/Bash…).
   * Le serveur remplace les implémentations Rust correspondantes par des
   * stubs qui ré-émettent un `tool/exec` vers nous.
   */
  executableTools?: string[];
  /**
   * Si vrai, le client signale au serveur qu'il sait traiter la requête
   * serveur→client `user/ask` (carte « Questions » bloquante au-dessus du
   * composer — §2.13 du backlog). Le serveur installe alors `RpcUserAsker`
   * au lieu de `RefuseAsker`. Default `false`.
   */
  interactiveAsk?: boolean;
}

/**
 * Client JSON-RPC NDJSON sur le stdio d'un processus `drox --serve`.
 */
export class DroxRpcClient extends EventEmitter {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly rl: readline.Interface;
  private nextId = 1;
  private readonly pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private readonly requestHandlers = new Map<string, RpcRequestHandler>();
  private disposed = false;

  constructor(
    private readonly executable: string,
    cwd: string,
    envOverrides: Record<string, string> = {},
  ) {
    super();
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const [k, v] of Object.entries(envOverrides)) {
      if (typeof v === "string" && v.length > 0) {
        env[k] = v;
      }
    }
    this.child = spawn(executable, ["--serve"], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.child.stderr?.on("data", (chunk: Buffer) => {
      this.emit("log", chunk.toString("utf8"));
    });

    this.child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        const wrapped = new Error(
          `binaire introuvable: \`${this.executable}\`. ` +
            `Build d'abord (\`cargo build -p drox-cli\`) ou renseigne le réglage ` +
            `\`drox.executablePath\` avec le chemin absolu vers drox.exe.`,
        );
        this.emit("error", wrapped);
      } else {
        this.emit("error", err);
      }
    });

    this.child.on("exit", (code, signal) => {
      this.dispose();
      this.emit("exit", code, signal);
    });

    this.rl = readline.createInterface({
      input: this.child.stdout,
      crlfDelay: Infinity,
    });

    this.rl.on("line", (line) => this.onLine(line));
  }

  private onLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    let msg: RpcIncoming;
    try {
      msg = JSON.parse(trimmed) as RpcIncoming;
    } catch {
      this.emit("log", `[parse] ligne JSON invalide: ${trimmed.slice(0, 200)}…\n`);
      return;
    }

    const hasMethod = "method" in msg && typeof msg.method === "string";
    const hasId = "id" in msg && msg.id !== null && msg.id !== undefined;

    // Requête serveur → client (a `method` ET `id`) — depuis v1.1.
    if (hasMethod && hasId) {
      const r = msg as { id: number | string; method: string; params?: unknown };
      void this.handleServerRequest(r.id, r.method, r.params);
      return;
    }

    // Réponse à l'une de nos requêtes (a `result` ou `error`, pas de `method`).
    if (("result" in msg || "error" in msg) && hasId) {
      const r = msg as { id: number | string; result?: unknown; error?: RpcError };
      const key = String(r.id);
      const p = this.pending.get(key);
      if (!p) {
        return;
      }
      this.pending.delete(key);
      if (r.error) {
        p.reject(new Error(`JSON-RPC ${r.error.code}: ${r.error.message}`));
      } else {
        p.resolve(r.result);
      }
      return;
    }

    // Notification (a `method`, pas d'`id`).
    if (hasMethod) {
      const n = msg as { method: string; params?: unknown };
      this.emit("notification", n.method, n.params);
    }
  }

  private async handleServerRequest(
    id: number | string,
    method: string,
    params: unknown,
  ): Promise<void> {
    const handler = this.requestHandlers.get(method);
    let payload: RpcRequestResult;
    if (!handler) {
      payload = {
        error: {
          code: -32601,
          message: `method not implemented by client: ${method}`,
        },
      };
    } else {
      try {
        payload = await handler(params);
      } catch (e) {
        payload = {
          error: {
            code: -32603,
            message: `handler threw: ${e instanceof Error ? e.message : String(e)}`,
          },
        };
      }
    }

    const response =
      "error" in payload && payload.error
        ? { jsonrpc: "2.0", id, error: payload.error }
        : { jsonrpc: "2.0", id, result: payload.result };
    this.writeLine(JSON.stringify(response));
  }

  /**
   * Enregistre un handler pour une méthode appelée par le serveur. Remplace
   * silencieusement un éventuel handler existant.
   */
  setRequestHandler(method: string, handler: RpcRequestHandler): void {
    this.requestHandlers.set(method, handler);
  }

  private writeLine(line: string): void {
    if (this.disposed) {
      return;
    }
    const ok = this.child.stdin.write(`${line}\n`, "utf8");
    if (!ok) {
      this.child.stdin.once("drain", () => {});
    }
  }

  request(method: string, params?: unknown): Promise<unknown> {
    if (this.disposed) {
      return Promise.reject(new Error("client fermé"));
    }
    const id = this.nextId++;
    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params: params ?? {},
    });
    return new Promise((resolve, reject) => {
      this.pending.set(String(id), { resolve, reject });
      this.writeLine(payload);
    });
  }

  async initialize(opts: InitializeOptions = {}): Promise<unknown> {
    return this.request("initialize", {
      protocolVersion: "1.0",
      clientName: "vscode-drox",
      clientVersion: "0.0.1",
      clientCapabilities: {
        executableTools: opts.executableTools ?? [],
        interactiveAsk: opts.interactiveAsk ?? false,
      },
    });
  }

  async agentRun(p: AgentRunParams): Promise<{ runId: string }> {
    const result = (await this.request("agent.run", {
      prompt: p.prompt,
      workspace: p.workspace,
      server: p.server,
      model: p.model,
      applyEdits: p.applyEdits,
      mode: p.mode,
      maxIterations: p.maxIterations,
      temperature: p.temperature,
      maxTokens: p.maxTokens,
      apiKey: p.apiKey,
      headers: p.headers,
      sessionId: p.sessionId,
      sessionDir: p.sessionDir,
      images: p.images && p.images.length > 0 ? p.images : undefined,
      nativeThinking: p.nativeThinking,
      disabledTools:
        p.disabledTools && p.disabledTools.length > 0
          ? p.disabledTools
          : undefined,
      mcpToolsEnabled: p.mcpToolsEnabled,
      runObjective: p.runObjective,
      subagentsEnabled: p.subagentsEnabled,
      subagentsMaxIterations: p.subagentsMaxIterations,
      subagentsMaxConcurrent: p.subagentsMaxConcurrent,
      subagentsModel: p.subagentsModel,
      subagentsNumCtx: p.subagentsNumCtx,
      numCtx: p.numCtx,
    })) as { runId: string };
    return result;
  }

  /**
   * Annule un run en cours côté moteur. Renvoie `cancelled: true` si le
   * `runId` était bien actif au moment de l'appel, `false` sinon (run déjà
   * terminé ou inconnu). N'attend pas la fin propre du run : la
   * notification `agent/done { status: "cancelled" }` arrivera ensuite via
   * le canal normal.
   */
  async agentCancel(runId: string): Promise<{ cancelled: boolean }> {
    try {
      const res = (await this.request("agent.cancel", { runId })) as {
        cancelled: boolean;
      };
      return res;
    } catch {
      // Le moteur renvoie une erreur si le runId est inconnu ; on traite
      // ça comme un no-op du point de vue de l'appelant.
      return { cancelled: false };
    }
  }

  async sessionList(dir?: string): Promise<SessionListEntry[]> {
    const res = (await this.request("session.list", { dir })) as {
      entries?: unknown;
    } | SessionListEntry[];
    // Le serveur renvoie soit { entries: [...] } soit directement le tableau
    // selon les évolutions ; on accepte les deux.
    if (Array.isArray(res)) {
      return res as SessionListEntry[];
    }
    const e = (res as { entries?: unknown }).entries;
    if (Array.isArray(e)) {
      return e as SessionListEntry[];
    }
    return [];
  }

  async sessionRead(id: string, dir?: string): Promise<SessionReadResponse> {
    const res = (await this.request("session.read", { id, dir })) as {
      messages?: TranscriptMessage[];
      uiStats?: { totalIn?: number; totalOut?: number; ctx?: number };
    };
    const messages = res.messages ?? [];
    const u = res.uiStats;
    const uiStats =
      u &&
      typeof u.totalIn === "number" &&
      typeof u.totalOut === "number" &&
      typeof u.ctx === "number"
        ? { totalIn: u.totalIn, totalOut: u.totalOut, ctx: u.ctx }
        : undefined;
    return { messages, uiStats };
  }

  /**
   * Compaction LLM sur le transcript JSONL de la session (sans `agent.run`).
   * Utilisé par la commande webview `/compact`.
   */
  async sessionCompact(p: {
    id: string;
    dir?: string;
    server?: string;
    model?: string;
    apiKey?: string;
    headers?: Record<string, string>;
  }): Promise<SessionCompactResult> {
    return (await this.request("session.compact", {
      id: p.id,
      dir: p.dir,
      server: p.server,
      model: p.model,
      apiKey: p.apiKey,
      headers: p.headers,
    })) as SessionCompactResult;
  }

  async shutdown(): Promise<void> {
    if (this.disposed) {
      return;
    }
    try {
      await this.request("shutdown", {});
    } catch {
      /* le process peut déjà être mort */
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.rl.close();
    for (const [, p] of this.pending) {
      p.reject(new Error("client fermé"));
    }
    this.pending.clear();
    try {
      this.child.stdin.end();
    } catch {
      /* ignore */
    }
    this.child.kill();
  }
}
