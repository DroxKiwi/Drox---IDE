import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  DroxRpcClient,
  type AgentRunImage,
  type AgentRunParams,
  type SessionCompactResult,
  type SessionUiStatsSnapshot,
  type TranscriptMessage,
} from "./droxRpcClient";
import { ClientToolRegistry, attachClientTools } from "./clientTools";
import { resolveDroxExecutable } from "./executablePath";
import {
  TERMINAL_SMART_PASTE_ABS_SENTINEL,
  type PasteCandidateTracker,
  type PasteCandidateWire,
} from "./pasteCandidates";
import { completeWorkspacePaths } from "./promptCompletion";
import { extractRunObjective } from "./runObjective";
import { describeToolCall, previewJson } from "./toolEventPreview";
import { createBashHandler } from "./tools/bash";
import { createFileEditHandler } from "./tools/fileEdit";
import { createFileWriteHandler } from "./tools/fileWrite";
import { createLspHandler } from "./tools/lsp";
import { createNotebookEditHandler } from "./tools/notebookEdit";
import { createSessionCompactHandler } from "./tools/sessionCompact";
import { createSessionEndHandler } from "./tools/sessionEnd";
import { createSessionSearchHandler } from "./tools/sessionSearch";
import { getCourseCycleStore } from "./courseCycleStore";
import { LongMemoryStore } from "./longMemoryStore";
import {
  getArchitectModel,
  getDisabledToolsForRun,
  getSubagentSettings,
  isMcpToolsEnabled,
  isToolEnabled,
} from "./toolSettings";
import { uiLogError, uiLogLine } from "./uiLog";

interface AttachmentPayload {
  name?: string;
  mime?: string;
  dataUrl?: string;
}

interface ReferencePayload {
  uri?: string;
}

/**
 * Pièce jointe **smart paste** (Sprint Smart Paste — §2.9 du backlog) :
 * le composer a reconnu un texte collé comme correspondant à une sélection
 * récente d'éditeur (matching par token FNV-1a, cf. `pasteCandidates.ts`) et
 * envoie la zone capturée en clair pour la joindre au prompt côté moteur.
 */
interface PasteAttachmentPayload {
  /** Identifiant local (chip) — réutilisé seulement pour les logs/traçage. */
  id?: string;
  kind?: "editor" | "terminal";
  /** Chemin absolu original (fsPath) ou sentinelle terminal. */
  absPath?: string;
  /** Chemin relatif workspace (POSIX) si disponible. */
  relPath?: string | null;
  languageId?: string;
  startLine?: number;
  endLine?: number;
  lineCount?: number;
  /** Contenu intégral capturé. */
  text?: string;
}

interface WebviewIncomingMessage {
  type: string;
  prompt?: string;
  mode?: string;
  attachments?: AttachmentPayload[];
  references?: ReferencePayload[];
  pastes?: PasteAttachmentPayload[];
  sessionId?: string;
  filePath?: string;
  /** Pour `openPasteSource`. */
  absPath?: string;
  startLine?: number;
  endLine?: number;
  /** Sprint Questions bloquantes (§2.13) — réponse à un `user/ask` en cours. */
  askId?: string;
  answers?: Array<{
    id: string;
    optionIds?: string[];
    freeText?: string;
    skipped?: boolean;
  }>;
  /** Diagnostic envoyé par la webview quand un drop ne donne aucune référence exploitable. */
  extracted?: number;
  types?: string[];
  snippets?: Array<{ mime: string; preview: string }>;
  /** Slash commands (§2.3 backlog) — `command` + `args` (ligne unique). */
  command?: string;
  args?: string;
  /** Erreur de validation côté webview (ex. pièces jointes interdites). */
  slashInvalid?: string;
  /** Complétion `@chemin` (§2.8). */
  requestId?: string;
  query?: string;
  /** Journal diagnostic webview → canal « Drox (UI) ». */
  text?: string;
}

/**
 * Sprint Questions bloquantes (§2.13) — entrée en attente côté `chatView`.
 * Un seul `user/ask` peut être actif à la fois ; quand la webview répond
 * via `userAskAnswer`, on résout la promesse pour que le tool Rust reçoive
 * sa réponse via JSON-RPC.
 */
interface PendingUserAsk {
  askId: string;
  questions: Array<{
    id: string;
    options: Array<{ id: string }>;
  }>;
  resolve: (
    answers: Array<{
      id: string;
      optionIds: string[];
      freeText: string;
      skipped: boolean;
    }>,
  ) => void;
}

/**
 * Renvoie l’identifiant de langage approximatif (utilisé comme classe CSS
 * dans le webview, et possiblement plus tard pour une coloration syntaxique).
 */
function languageFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".json": "json",
    ".ipynb": "json",
    ".jsonc": "json",
    ".md": "markdown",
    ".rs": "rust",
    ".toml": "toml",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".htm": "html",
    ".py": "python",
    ".go": "go",
    ".sh": "bash",
    ".bash": "bash",
    ".ps1": "powershell",
    ".sql": "sql",
    ".xml": "xml",
  };
  return map[ext] ?? "plaintext";
}

/** `path` ou `file_path` dans les arguments d’un tool fichier. */
function toolArgPath(args: unknown): string {
  if (!args || typeof args !== "object") {
    return "";
  }
  const o = args as Record<string, unknown>;
  const p = o.path ?? o.file_path;
  return typeof p === "string" ? p.replace(/\\/g, "/") : "";
}

/** Compte les +/- d'un diff unifié (créé par la lib `diff`). */
function countDiffLines(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ") || line.startsWith("--- ")) continue;
    if (line.startsWith("+")) added += 1;
    else if (line.startsWith("-")) removed += 1;
  }
  return { added, removed };
}

/** Normalise la sortie JSON d'un tool (objet ou chaîne JSON). */
function normalizeToolFinishOutput(
  output: unknown,
): Record<string, unknown> | null {
  if (output === null || output === undefined) {
    return null;
  }
  if (typeof output === "string") {
    try {
      const v = JSON.parse(output) as unknown;
      return typeof v === "object" && v !== null
        ? (v as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof output === "object") {
    return output as Record<string, unknown>;
  }
  return null;
}

/** Détecte une écriture réussie même si `applied` manque (robustesse serde). */
function toolOutputIndicatesApplied(
  toolName: string,
  out: Record<string, unknown>,
): boolean {
  if (out.applied === true || out.applied === 1) {
    return true;
  }
  if (out.error !== undefined) {
    return false;
  }
  if (
    toolName === "file_edit" &&
    typeof out.edits_applied === "number" &&
    out.edits_applied > 0
  ) {
    return true;
  }
  if (toolName === "file_write" && typeof out.bytes_written === "number") {
    return true;
  }
  if (
    toolName === "notebook_edit" &&
    typeof out.cell_edits_applied === "number" &&
    out.cell_edits_applied > 0
  ) {
    return true;
  }
  return false;
}

/** Statuts acceptés pour un item de `todo_write`. Aligné sur l'enum Rust. */
const TODO_STATUSES = new Set([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

/** Item normalisé pour la webview (string id + content + status validé). */
export interface TodoItemPayload {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

/** Reconnaît un output de `todo_write` : objet avec un champ `todos` array. */
function isTodoWriteOutput(output: unknown): boolean {
  const out = normalizeToolFinishOutput(output);
  if (!out) return false;
  return Array.isArray(out.todos);
}

const COURSE_STEP_STATUSES = new Set([
  "pending",
  "active",
  "mastered",
  "skipped",
]);

const COURSE_STEP_KINDS = new Set(["lesson", "exercise", "checkpoint"]);

export interface CourseStepPayload {
  id: string;
  title: string;
  kind: "lesson" | "exercise" | "checkpoint";
  status: "pending" | "active" | "mastered" | "skipped";
}

export interface CoursePlanPayload {
  courseTitle: string;
  steps: CourseStepPayload[];
}

function isCoursePlanWriteOutput(output: unknown): boolean {
  const out = normalizeToolFinishOutput(output);
  if (!out) return false;
  return Array.isArray(out.steps);
}

function extractCoursePlan(output: unknown): CoursePlanPayload | null {
  const out = normalizeToolFinishOutput(output);
  if (!out || !Array.isArray(out.steps)) return null;
  const titleRaw =
    typeof out.courseTitle === "string"
      ? out.courseTitle
      : typeof out.course_title === "string"
        ? out.course_title
        : "";
  const courseTitle = titleRaw.trim();
  if (!courseTitle) return null;
  const steps: CourseStepPayload[] = [];
  for (const raw of out.steps) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const title = typeof r.title === "string" ? r.title.trim() : "";
    const kindRaw = typeof r.kind === "string" ? r.kind : "";
    const statusRaw = typeof r.status === "string" ? r.status : "";
    if (!id || !title || !COURSE_STEP_KINDS.has(kindRaw)) continue;
    if (!COURSE_STEP_STATUSES.has(statusRaw)) continue;
    steps.push({
      id,
      title,
      kind: kindRaw as CourseStepPayload["kind"],
      status: statusRaw as CourseStepPayload["status"],
    });
  }
  if (steps.length === 0) return null;
  return { courseTitle, steps };
}

/** Extrait + normalise la liste de todos depuis un output `tool_finish`. */
function extractTodos(output: unknown): TodoItemPayload[] | null {
  const out = normalizeToolFinishOutput(output);
  if (!out || !Array.isArray(out.todos)) return null;
  const result: TodoItemPayload[] = [];
  for (const raw of out.todos) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    const content = typeof r.content === "string" ? r.content.trim() : "";
    const statusRaw = typeof r.status === "string" ? r.status : "";
    if (!id || !content || !TODO_STATUSES.has(statusRaw)) continue;
    result.push({
      id,
      content,
      status: statusRaw as TodoItemPayload["status"],
    });
  }
  return result;
}

/** Extrait un message d'erreur lisible depuis un output `tool_finish`. */
function extractErrorMessage(output: unknown): string | null {
  const out = normalizeToolFinishOutput(output);
  if (!out) return typeof output === "string" ? output : null;
  if (typeof out.error === "string") return out.error;
  if (typeof out.message === "string") return out.message;
  return null;
}

function newSessionId(): string {
  return `ses_${crypto.randomUUID()}`;
}

/** Première ligne non vide du transcript (utilisée comme titre de session). */
function transcriptPreviewTitle(messages: TranscriptMessage[]): string {
  for (const m of messages) {
    if (m.role !== "user") continue;
    for (const c of m.content) {
      if (c.type === "text") {
        const line = c.text.split(/\r?\n/)[0]?.trim();
        if (line) {
          return line.length > 80 ? line.slice(0, 80) + "…" : line;
        }
      }
    }
  }
  return "Discussion sans titre";
}

const VALID_MODES = new Set([
  "default",
  "plan",
  "acceptEdits",
  "bypassPermissions",
  "professor",
]);

function sanitizeFileName(name: string): string {
  const base = (name || "image").replace(/[^a-zA-Z0-9._-]+/g, "_");
  return base.length > 64 ? base.slice(0, 64) : base;
}

function extFromMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/png":
      return ".png";
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/bmp":
      return ".bmp";
    default:
      return "";
  }
}

/** Décode un data URL `data:<mime>;base64,XXX` → { mime, bytes } ou `null`. */
function decodeDataUrl(
  dataUrl: string,
): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:([^;,]+);base64,(.*)$/i.exec(dataUrl);
  if (!m) {
    return null;
  }
  try {
    const bytes = Buffer.from(m[2], "base64");
    return { mime: m[1], bytes: new Uint8Array(bytes) };
  } catch {
    return null;
  }
}

function getNonce(): string {
  let t = "";
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    t += c.charAt(Math.floor(Math.random() * c.length));
  }
  return t;
}

function getConfiguredExecutablePath(): string {
  const cfg = vscode.workspace.getConfiguration("drox");
  return (cfg.get<string>("executablePath") ?? "").trim();
}

/**
 * Lit `drox.openModifiedFiles` (default `true`). Indique si on doit ouvrir
 * automatiquement les fichiers modifiés par l'agent dans l'éditeur.
 */
function shouldOpenModifiedFiles(scope?: vscode.Uri): boolean {
  const cfg = vscode.workspace.getConfiguration("drox", scope);
  const v = cfg.get<unknown>("openModifiedFiles");
  return typeof v === "boolean" ? v : true;
}

/** Replay visuel du JSONL dans la webview (désactivé par défaut). */
function isReplayTranscriptOnLoadEnabled(scope?: vscode.Uri): boolean {
  const cfg = vscode.workspace.getConfiguration("drox", scope);
  return cfg.get<boolean>("replayTranscriptOnLoad") === true;
}

/** Sous-option : blocs outils / diffs (sinon texte compact). */
function isReplayTranscriptRichEnabled(scope?: vscode.Uri): boolean {
  const cfg = vscode.workspace.getConfiguration("drox", scope);
  return cfg.get<boolean>("replayTranscriptRich") === true;
}

/** Diffs fichier dans l'historique rejoué (`fileChange` dans la webview). */
function isReplayTranscriptFileDiffsEnabled(scope?: vscode.Uri): boolean {
  const cfg = vscode.workspace.getConfiguration("drox", scope);
  const v = cfg.get<boolean>("replayTranscriptFileDiffs");
  return v !== false;
}

function isFileMutationToolName(
  name: string,
): name is "file_edit" | "file_write" | "notebook_edit" {
  return (
    name === "file_edit" || name === "file_write" || name === "notebook_edit"
  );
}

/** Tronque diff / contenu lors du replay pour limiter la charge DOM. */
function truncateForReplay(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n… (tronqué pour le replay historique)`;
}

/**
 * Normalise un chemin avant `showTextDocument`. Rejette les URI corrompues
 * (`file://%3F/c%3A/...`, préfixe `?` sous Windows) qui font planter d'autres
 * extensions (ex. Continue) et figent l'UI.
 */
function sanitizePathForEditor(raw: string): string | null {
  let p = raw.trim();
  if (!p) {
    return null;
  }
  if (p.startsWith("file://") || p.includes("://")) {
    try {
      p = vscode.Uri.parse(p).fsPath;
    } catch {
      return null;
    }
  }
  if (p.startsWith("?") && /^[a-zA-Z]:/.test(p.slice(1))) {
    p = p.slice(1);
  }
  if (p.includes("\0") || /%3[fF]/.test(p)) {
    return null;
  }
  return p;
}

interface DroxLlmSettings {
  server: string;
  model: string;
  apiKey: string;
  primaryLanguage: string;
  maxIterations: number;
  temperature: number | null;
  maxTokens: number | null;
  /** Borne de tokens générés (Ollama `num_predict`). */
  numPredict: number | null;
  /** Taille de la fenêtre de contexte Ollama (`num_ctx`). */
  numCtx: number | null;
  /** Ollama `top_p` (sampling nucleus). */
  topP: number | null;
  /** Ollama `top_k`. */
  topK: number | null;
  /** Ollama `repeat_penalty`. */
  repeatPenalty: number | null;
  /** Ollama `seed` (déterministe si fixé). */
  seed: number | null;
  /** Ollama `min_p` (filtre relatif au token max). */
  minP: number | null;
  /** Ollama `presence_penalty` (style OpenAI). */
  presencePenalty: number | null;
  /** Ollama `frequency_penalty` (style OpenAI). */
  frequencyPenalty: number | null;
  /** Ollama `keep_alive` — durée de cache modèle (`"5m"`, `"1h"`, `"0"`, `"-1"`). */
  keepAlive: string;
  /** Active `think: true` Ollama + affichage `internal_reasoning` dans le chat. */
  nativeThinking: boolean;
}

function getLlmSettings(scope?: vscode.Uri): DroxLlmSettings {
  const cfg = vscode.workspace.getConfiguration("drox", scope);
  const num = (key: string): number | null => {
    const v = cfg.get<unknown>(key);
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return {
    server: (cfg.get<string>("server") ?? "").trim(),
    model: getArchitectModel(scope),
    apiKey: (cfg.get<string>("apiKey") ?? "").trim(),
    primaryLanguage: (cfg.get<string>("primaryLanguage") ?? "").trim(),
    maxIterations: cfg.get<number>("maxIterations") ?? 12,
    temperature: num("temperature"),
    maxTokens: num("maxTokens"),
    numPredict: num("numPredict"),
    numCtx: num("numCtx"),
    topP: num("topP"),
    topK: num("topK"),
    repeatPenalty: num("repeatPenalty"),
    seed: num("seed"),
    minP: num("minP"),
    presencePenalty: num("presencePenalty"),
    frequencyPenalty: num("frequencyPenalty"),
    keepAlive: (cfg.get<string>("keepAlive") ?? "").trim(),
    nativeThinking: cfg.get<boolean>("nativeThinking") ?? false,
  };
}

/** Mappe les settings non vides vers leurs variables d’environnement Drox équivalentes. */
function settingsToEnv(s: DroxLlmSettings): Record<string, string> {
  const env: Record<string, string> = {};
  if (s.server) env.DROX_SERVER = s.server;
  if (s.model) env.DROX_MODEL = s.model;
  if (s.apiKey) env.DROX_API_KEY = s.apiKey;
  if (s.primaryLanguage) env.DROX_PRIMARY_LANGUAGE = s.primaryLanguage;
  if (typeof s.numPredict === "number" && s.numPredict > 0) {
    env.DROX_NUM_PREDICT = String(Math.floor(s.numPredict));
  }
  if (typeof s.numCtx === "number" && s.numCtx > 0) {
    env.DROX_NUM_CTX = String(Math.floor(s.numCtx));
  }
  if (typeof s.topP === "number" && Number.isFinite(s.topP)) {
    env.DROX_TOP_P = String(s.topP);
  }
  if (typeof s.topK === "number" && s.topK > 0) {
    env.DROX_TOP_K = String(Math.floor(s.topK));
  }
  if (typeof s.repeatPenalty === "number" && Number.isFinite(s.repeatPenalty)) {
    env.DROX_REPEAT_PENALTY = String(s.repeatPenalty);
  }
  if (typeof s.seed === "number" && Number.isFinite(s.seed)) {
    env.DROX_SEED = String(Math.floor(s.seed));
  }
  if (typeof s.minP === "number" && Number.isFinite(s.minP)) {
    env.DROX_MIN_P = String(s.minP);
  }
  if (typeof s.presencePenalty === "number" && Number.isFinite(s.presencePenalty)) {
    env.DROX_PRESENCE_PENALTY = String(s.presencePenalty);
  }
  if (typeof s.frequencyPenalty === "number" && Number.isFinite(s.frequencyPenalty)) {
    env.DROX_FREQUENCY_PENALTY = String(s.frequencyPenalty);
  }
  if (s.keepAlive) {
    env.DROX_KEEP_ALIVE = s.keepAlive;
  }
  return env;
}

/** ID de la vue webview déclaré dans `package.json` → `views` → `drox`. */
export const DROX_CHAT_VIEW_ID = "drox.chat";

/** Clé `workspaceState` : dernière session à rouvrir après rechargement webview / extension. */
const WORKSPACE_LAST_SESSION_KEY = "drox.chat.lastSessionId";

/** Au-delà de ce seuil, replay texte léger même si `replayTranscriptRich` est activé. */
const REPLAY_LIGHT_MESSAGE_THRESHOLD = 80;

/** Pause entre paquets de messages replay (ms). */
const REPLAY_YIELD_MS = 48;

/** Messages par paquet avant yield. */
const REPLAY_YIELD_EVERY = 6;

/** Limite de diffs fichier émis pendant un replay (évite freeze DOM). */
const REPLAY_MAX_FILE_CHANGE_EVENTS = 100;

/** Taille max d'un diff rejoué dans la webview. */
const REPLAY_MAX_DIFF_CHARS = 14_000;

/** Taille max du contenu `file_write` rejoué. */
const REPLAY_MAX_WRITE_CONTENT_CHARS = 6_000;

/** Texte affiché dans le sticky « dernier message utilisateur » (§2.24). */
const USER_PROMPT_STICKY_MAX_CHARS = 140;

function truncateUserPromptStickyText(
  text: string,
  max = USER_PROMPT_STICKY_MAX_CHARS,
): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}…`;
}

/** Payload webview pour `#user-prompt-sticky`. */
function buildUserPromptStickyPayload(
  displayed: string,
  trimmed: string,
  attachmentsCount: number,
  referencesCount: number,
  pastesCount: number,
): { text: string; meta?: string; fullText: string } {
  const metaParts: string[] = [];
  if (attachmentsCount > 0) {
    metaParts.push(
      attachmentsCount === 1 ? "1 image" : `${attachmentsCount} images`,
    );
  }
  if (referencesCount > 0) {
    metaParts.push(
      referencesCount === 1
        ? "1 référence"
        : `${referencesCount} références`,
    );
  }
  if (pastesCount > 0) {
    metaParts.push(
      pastesCount === 1 ? "1 collage" : `${pastesCount} collages`,
    );
  }
  const meta = metaParts.length > 0 ? metaParts.join(" · ") : undefined;
  const primary = trimmed.trim();
  if (primary) {
    return {
      text: truncateUserPromptStickyText(primary),
      meta,
      fullText: displayed,
    };
  }
  if (meta) {
    return { text: meta, fullText: displayed || meta };
  }
  return {
    text: truncateUserPromptStickyText(displayed),
    fullText: displayed,
  };
}

export class DroxChatViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly disposables: vscode.Disposable[] = [];
  private client: DroxRpcClient | undefined;
  private initPromise: Promise<void> | undefined;
  private closed = false;
  /** True tant que la webview affiche la page « ouvrez un dossier ». */
  private showingNoWorkspaceBanner = false;
  /** Identifiant `ses_*` de la conversation courante (créé au 1er envoi). */
  private currentSessionId: string | undefined;
  /** Après `session_end` réussi : reset chat + nouveau session id au prochain `agent/done`. */
  private pendingSessionReset = false;
  /** Cache mémoire longue par racine workspace (fsPath). */
  private readonly longMemoryByWorkspace = new Map<string, Promise<LongMemoryStore>>();
  /**
   * `runId` retourné par `agent.run` pour le tour en cours. Sert au bouton
   * « Stop » de la webview : on l'envoie à `agent.cancel`. Reset à
   * `undefined` à la fin du run (`agent/done` ou exit) ou sur cancel.
   */
  private currentRunId: string | undefined;
  /**
   * True pendant `loadSession` / restore : pas d'ouverture auto des fichiers
   * et replay avec yields pour ne pas bloquer la webview (historique, composer).
   */
  private replayingTranscript = false;
  /** Nombre de `fileChange` déjà postés pendant le replay en cours. */
  private replayFileChangeCount = 0;
  private replayFileChangeLimitNotified = false;
  /**
   * Compteur d'annulation des chargements de session. Incrémenté à chaque
   * `loadSession` / `startNewChat` pour ne pas bloquer le handler webview.
   */
  private sessionLoadGeneration = 0;
  /** Cache `tool_use_id` → métadonnées utiles au moment du `tool_finish` (nom + args). */
  private readonly pendingTools = new Map<
    string,
    { name: string; args: unknown }
  >();
  /**
   * Sprint Questions bloquantes (§2.13) — `user/ask` en cours d'attente.
   * Un seul à la fois côté webview (le moteur n'envoie pas de question
   * tant qu'il n'a pas reçu la réponse précédente).
   */
  private pendingUserAsk: PendingUserAsk | undefined;

  /** Compteur de posts webview (diagnostic flood). */
  private webviewPostCount = 0;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly output: vscode.OutputChannel,
    private readonly uiOutput: vscode.OutputChannel,
    private readonly pasteTracker: PasteCandidateTracker | undefined,
    private readonly extensionContext: vscode.ExtensionContext,
  ) {
    if (this.pasteTracker) {
      this.disposables.push(
        this.pasteTracker.onDidUpdate((c) => this.postPasteCandidate(c)),
      );
    }
  }

  private logUi(message: string): void {
    uiLogLine(this.uiOutput, message);
  }

  private logUiError(context: string, err: unknown): void {
    uiLogError(this.uiOutput, context, err);
  }

  private longMemoryForWorkspace(ws: string): Promise<LongMemoryStore> {
    const existing = this.longMemoryByWorkspace.get(ws);
    if (existing) {
      return existing;
    }
    const p = LongMemoryStore.open(this.extensionContext, ws);
    this.longMemoryByWorkspace.set(ws, p);
    return p;
  }

  private async ingestContextChunkSummary(
    ws: string,
    raw: Record<string, unknown>,
  ): Promise<void> {
    try {
      const store = await this.longMemoryForWorkspace(ws);
      await store.ingestContextChunkSummary(raw);
    } catch (e) {
      this.output.appendLine(
        `[drox] mémoire longue (ingest chunk): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private async sessionCompactCurrentWorkspace(
    wsUri: vscode.Uri,
    sessionId: string,
  ): Promise<SessionCompactResult> {
    const client = await this.ensureClient();
    const settings = getLlmSettings(wsUri);
    return client.sessionCompact({
      id: sessionId,
      server: settings.server || undefined,
      model: settings.model || undefined,
      apiKey: settings.apiKey || undefined,
    });
  }

  private async ingestLongMemoryAfterSessionCompact(
    workspaceRoot: string,
    sessionId: string,
    res: SessionCompactResult,
  ): Promise<void> {
    try {
      const store = await this.longMemoryForWorkspace(workspaceRoot);
      await store.ingestFromSessionCompact({
        transcriptSessionId: sessionId,
        workspaceFingerprint: workspaceRoot,
        summary: res.summary,
        filesTouched: res.filesTouched,
        usage: res.usage,
      });
    } catch (e) {
      this.output.appendLine(
        `[drox] mémoire longue (ingest compact manuel): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private postPasteCandidate(c: PasteCandidateWire): void {
    if (!this.view) return;
    void this.view.webview.postMessage({ kind: "pasteCandidate", candidate: c });
  }

  /**
   * Ouvre le sélecteur de fichiers natif et ajoute les chemins choisis comme
   * références dans le composer (contournement fiable au drag-drop Explorateur
   * → webview, limité par VS Code / Electron).
   */
  async pickContextReferences(): Promise<void> {
    await DroxChatViewProvider.reveal();
    // La webview peut s’attacher quelques ms après l’ouverture du conteneur.
    await new Promise((r) => setTimeout(r, 150));
    if (!this.view) {
      void vscode.window.showWarningMessage(
        "Ouvre la vue Drox (icône Drox dans la barre d’activité), attends un instant, puis relance la commande.",
      );
      return;
    }

    const ws = this.workspaceRoot();
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: true,
      canSelectMany: true,
      defaultUri: ws ? vscode.Uri.file(ws) : undefined,
      openLabel: "Ajouter comme références",
      title: "Drox — références (fichiers ou dossiers)",
    });
    if (!picked || picked.length === 0) {
      return;
    }
    const uris = picked.map((u) => u.toString());
    this.postRefsToWebview(uris);
  }

  /** Envoie des URIs `file://` vers la webview pour les chips « références ». */
  postRefsToWebview(uris: string[]): void {
    if (!uris.length || !this.view) {
      return;
    }
    void this.view.webview.postMessage({ kind: "appendReferences", uris });
  }

  /**
   * Préremplit le composer sans envoyer (§2.19 — erreurs éditeur → chat).
   * Ouvre le panneau Drox si besoin.
   */
  async prefillComposer(text: string, replace = false): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    await DroxChatViewProvider.reveal();
    if (!this.view) {
      await new Promise((r) => setTimeout(r, 150));
    }
    this.post("prefillPrompt", { text: trimmed, replace });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.closed = false;
    this.view = webviewView;
    this.logUi("resolveWebviewView()");
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };

    this.applyWebviewContent(webviewView.webview);

    if (this.pasteTracker) {
      this.pasteTracker.resync();
    }

    webviewView.webview.onDidReceiveMessage(
      async (msg: WebviewIncomingMessage) => {
        const type = typeof msg?.type === "string" ? msg.type : "?";
        const t0 = Date.now();
        this.logUi(`← webview type=${type}`);
        try {
          await this.dispatchWebviewMessage(webviewView, msg);
          this.logUi(`← webview type=${type} OK (${Date.now() - t0}ms)`);
        } catch (e) {
          this.logUiError(`← webview type=${type}`, e);
          this.output.appendLine(
            `[drox] webview handler error (${type}): ${e instanceof Error ? e.message : String(e)}`,
          );
          this.post("append", {
            role: "error",
            text: `Erreur interne Drox (${type}) — voir le canal Sortie « Drox (UI) ».`,
          });
        }
      },
      undefined,
      this.disposables,
    );

    webviewView.onDidDispose(
      () => {
        void this.shutdownAndDispose();
      },
      null,
      this.disposables,
    );

    const wsSub = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      if (!this.view || this.closed) {
        return;
      }
      const has = Boolean(this.workspaceRoot());
      if (this.showingNoWorkspaceBanner && has) {
        this.applyWebviewContent(this.view.webview);
      } else if (!this.showingNoWorkspaceBanner && !has) {
        this.applyWebviewContent(this.view.webview);
      }
    });
    this.disposables.push(wsSub);

    const cfgSub = vscode.workspace.onDidChangeConfiguration((e) => {
      // Les settings injectées en variables d'environnement (serveur, modèle,
      // apiKey, langue principale, chemin du binaire) ne s'appliquent qu'au
      // démarrage du processus moteur. On invite l'utilisateur à le relancer.
      const respawnKeys = [
        "drox.server",
        "drox.architect.model",
        "drox.executor.model",
        "drox.model",
        "drox.subagents.model",
        "drox.apiKey",
        "drox.primaryLanguage",
        "drox.executablePath",
      ];
      const needsRespawn = respawnKeys.some((k) => e.affectsConfiguration(k));
      if (needsRespawn && this.client) {
        void this.promptRespawn();
        return;
      }
      if (
        e.affectsConfiguration("drox.tools.disabled") ||
        e.affectsConfiguration("drox.tools.mcp.enabled")
      ) {
        this.resetEngineClient();
      }
    });
    this.disposables.push(cfgSub);
  }

  /** Recrée le client RPC au prochain envoi (changement outils on/off). */
  private resetEngineClient(): void {
    if (this.client) {
      this.client.dispose();
      this.client = undefined;
      this.initPromise = undefined;
      this.currentRunId = undefined;
      this.logUi("moteur : client réinitialisé (réglages outils)");
    }
  }

  /**
   * Enregistre les handlers client uniquement pour les outils activés (§2.17).
   */
  private registerClientTools(
    registry: ClientToolRegistry,
    scope: vscode.Uri,
    longMem: LongMemoryStore,
  ): void {
    if (isToolEnabled("file_write", scope)) {
      registry.register("file_write", createFileWriteHandler());
    }
    if (isToolEnabled("file_edit", scope)) {
      registry.register("file_edit", createFileEditHandler());
    }
    if (isToolEnabled("notebook_edit", scope)) {
      registry.register("notebook_edit", createNotebookEditHandler());
    }
    if (isToolEnabled("bash", scope)) {
      registry.register("bash", createBashHandler());
    }
    if (isToolEnabled("lsp", scope)) {
      registry.register("lsp", createLspHandler());
    }
    if (isToolEnabled("session_compact", scope)) {
      registry.register(
        "session_compact",
        createSessionCompactHandler({
          getClient: () => this.client,
          getSessionId: () => this.currentSessionId,
          onCompactSuccess: async (workspace, sessionId, res) => {
            await this.ingestLongMemoryAfterSessionCompact(
              workspace,
              sessionId,
              res,
            );
          },
        }),
      );
    }
    // `session_end` : commande utilisateur / mémoire — toujours côté client.
    registry.register(
      "session_end",
      createSessionEndHandler({
        getSessionId: () => this.currentSessionId,
        store: longMem,
        onStored: () => {
          this.pendingSessionReset = true;
        },
      }),
    );
    if (isToolEnabled("session_search", scope)) {
      registry.register("session_search", createSessionSearchHandler(longMem));
    }
  }

  /** Propose à l'utilisateur de relancer le moteur après changement de settings. */
  private async promptRespawn(): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      "Drox : un réglage moteur a changé (serveur, modèle, clé API, langue ou exécutable).",
      { modal: false },
      "Relancer maintenant",
      "Plus tard",
    );
    if (choice === "Relancer maintenant") {
      await this.respawnEngine();
    }
  }

  /** Arrête le moteur actuel et le redémarre avec les nouvelles settings. */
  private async respawnEngine(): Promise<void> {
    if (this.client) {
      try {
        await this.client.shutdown();
      } catch {
        /* ignore */
      }
      this.client.dispose();
      this.client = undefined;
    }
    this.initPromise = undefined;
    this.post("append", {
      role: "system",
      text: "[moteur] redémarré avec les nouveaux paramètres.",
    });
    try {
      await this.ensureClient();
    } catch (e) {
      this.post("append", {
        role: "error",
        text: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /** Ouvre le conteneur latéral Drox dans la barre d’activité (comme Copilot / Roo). */
  static async reveal(): Promise<void> {
    try {
      await vscode.commands.executeCommand("workbench.view.extension.drox");
    } catch {
      void vscode.window.showErrorMessage(
        "Impossible d’ouvrir la barre latérale Drox (commande workbench).",
      );
    }
  }

  private workspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private applyWebviewContent(webview: vscode.Webview): void {
    const ws = this.workspaceRoot();
    if (!ws) {
      this.showingNoWorkspaceBanner = true;
      this.logUi("applyWebviewContent: pas de workspace → bannière");
      webview.html = this.buildNoWorkspaceHtml();
      return;
    }
    this.showingNoWorkspaceBanner = false;
    this.logUi(`applyWebviewContent: workspace=${ws}`);
    const nonce = getNonce();
    webview.html = this.buildChatHtml(webview, nonce);
  }

  private buildNoWorkspaceHtml(): string {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-descriptionForeground);
      padding: 16px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <p><strong>Drox</strong> — ouvrez un dossier workspace (<strong>Fichier → Ouvrir le dossier…</strong>).
  La vue se mettra à jour automatiquement.</p>
</body>
</html>`;
  }

  private buildChatHtml(webview: vscode.Webview, nonce: string): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "media", "chat.css"),
    );
    const chatJsPath = vscode.Uri.joinPath(this.extensionUri, "media", "chat.js");
    let chatJsInline = "";
    try {
      const raw = readFileSync(chatJsPath.fsPath, "utf8");
      // Évite de fermer la balise <script> si le JS contient "</script".
      chatJsInline = raw.replace(/<\/script/gi, "<\\/script");
      this.logUi(`chat.js inline ${chatJsInline.length} caractères`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logUi(`ERREUR lecture chat.js: ${msg}`);
      chatJsInline = `console.error("Drox: impossible de charger chat.js — ${msg.replace(/"/g, '\\"')}");`;
    }
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `img-src ${webview.cspSource} data: blob:`,
      `script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-inline'`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Drox</title>
</head>
<body>
  <div id="progress" class="progress" hidden></div>

  <header class="header">
    <div class="header-left">
      <button id="new-chat" class="icon-btn" type="button" title="Nouvelle discussion (Ctrl+N)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 5v14"></path>
          <path d="M5 12h14"></path>
        </svg>
      </button>
      <button id="history-toggle" class="icon-btn" type="button" title="Historique des discussions (Ctrl+H)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 7v5l3 2"></path>
        </svg>
      </button>
      <button id="open-settings" class="icon-btn" type="button" title="Paramètres Drox">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      </button>
      <span class="brand">Drox</span>
    </div>
    <span class="mode-picker">
      <select id="mode" title="Mode de permission">
        <option value="default">Default</option>
        <option value="plan">Plan</option>
        <option value="acceptEdits" selected>Accept edits</option>
        <option value="bypassPermissions">Bypass</option>
        <option value="professor">Professeur</option>
      </select>
    </span>
  </header>

  <div id="history-panel" class="history-panel" aria-hidden="true">
    <div class="history-head">
      <span>Discussions</span>
      <button id="history-close" class="icon-btn" type="button" title="Fermer (Échap)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M6 6l12 12"></path>
          <path d="M18 6l-12 12"></path>
        </svg>
      </button>
    </div>
    <div id="history-list" class="history-list">
      <div class="history-empty">Aucune conversation enregistrée pour l’instant.</div>
    </div>
  </div>

  <div id="user-prompt-sticky" class="user-prompt-sticky" hidden role="button" tabindex="0"
       title="Cliquer pour retrouver votre message dans le fil"></div>

  <div id="run-objective-sticky" class="run-objective-sticky" hidden role="status"
       title="Objectif verrouillé pour ce run"></div>

  <div id="scope-parking" class="scope-parking" hidden>
    <button id="scope-parking-toggle" class="scope-parking-toggle" type="button"
            aria-expanded="false" title="Éléments reportés hors scope"></button>
    <ul id="scope-parking-list" class="scope-parking-list" hidden></ul>
  </div>

  <div id="log" class="log" aria-live="polite"></div>

  <div id="todo-sticky" class="todo-sticky" hidden role="button" tabindex="0"
       title="Cliquer pour voir la liste complète dans le chat"></div>

  <div id="course-plan-sticky" class="course-plan-sticky" hidden role="button" tabindex="0"
       title="Cliquer pour voir le plan de cours dans le chat"></div>

  <div id="course-cycle-banner" class="course-cycle-banner" hidden role="status"
       aria-live="polite"></div>

  <div id="professor-guard-banner" class="professor-guard-banner" hidden role="status"
       aria-live="polite"></div>

  <div id="composer" class="composer">
    <p class="composer-hint" role="note">
      Glisser-déposer depuis l’Explorateur : utilisez la vue <strong>Références</strong> (au-dessus du chat dans la barre Drox), ou le bouton <strong>+</strong> / <kbd>Ctrl+I</kbd>.
    </p>
    <div id="attachments" class="attachments" aria-label="Images jointes"></div>
    <div id="refs" class="refs" aria-label="Références"></div>
    <div id="user-ask" class="user-ask" hidden aria-live="polite" aria-label="Questions de l'agent"></div>

    <div class="editor">
      <div id="pending-prompts" class="pending-prompts" hidden aria-live="polite" aria-label="Messages en attente"></div>
      <div id="prompt-suggestions" class="prompt-suggestions" hidden role="listbox" aria-label="Complétion de chemins"></div>
      <textarea id="prompt" rows="1" placeholder="Demander à Drox… (@ fichier · /help · Entrée = envoyer)"></textarea>
      <div class="composer-toolbar">
        <div class="toolbar-left">
          <button id="add-refs" class="icon-btn" type="button" title="Ajouter des fichiers/dossiers en référence (Ctrl+I)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 5v14"></path>
              <path d="M5 12h14"></path>
            </svg>
          </button>
          <button id="attach" class="icon-btn" type="button" title="Joindre une image (ou drag-drop / Ctrl+V)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"></path>
            </svg>
          </button>
          <input id="file-input" type="file" accept="image/*" multiple style="display:none" />
        </div>
        <div class="toolbar-right">
          <button id="stop-run" class="icon-btn stop-run-btn" type="button" hidden title="Arrêter le run en cours">
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
              <rect x="7" y="7" width="10" height="10" rx="1.5"></rect>
            </svg>
          </button>
          <button id="send" class="send-btn" type="button" title="Envoyer (Entrée)">
            <span id="send-queue-badge" class="send-queue-badge" hidden aria-hidden="true"></span>
            <svg class="icon-send" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12h14"></path>
              <path d="M13 6l6 6-6 6"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <footer class="status">
    <span id="status-state" class="stat status-state" hidden>
      <span class="pulse-dot" aria-hidden="true"></span>
      <span id="status-state-text"></span>
    </span>
    <span class="spacer"></span>
    <span class="stat" title="Tokens d'entrée cumulés sur la session">↑ <strong id="tok-in">0</strong></span>
    <span class="stat" title="Tokens de sortie cumulés sur la session">↓ <strong id="tok-out">0</strong></span>
    <span class="stat" title="Tokens estimés dans le contexte courant après compaction">ctx <strong id="ctx">0</strong></span>
  </footer>

  <script nonce="${nonce}">${chatJsInline}</script>
</body>
</html>`;
  }

  private shouldLogPostKind(kind: string): boolean {
    return (
      kind !== "tool" &&
      kind !== "delta" &&
      kind !== "usage" &&
      kind !== "pasteCandidate"
    );
  }

  private post(kind: string, body: Record<string, unknown>): void {
    if (this.closed || !this.view) {
      this.logUi(`→ webview kind=${kind} IGNORÉ (vue fermée)`);
      return;
    }
    this.webviewPostCount += 1;
    if (this.shouldLogPostKind(kind)) {
      const extra =
        kind === "append" && typeof body.role === "string"
          ? ` role=${body.role}`
          : kind === "replay"
            ? ` active=${String(body.active)}`
            : kind === "session"
              ? ` id=${String(body.id ?? "null")}`
              : "";
      this.logUi(`→ webview #${this.webviewPostCount} kind=${kind}${extra}`);
    }
    void this.view.webview.postMessage({ kind, ...body });
  }

  private async dispatchWebviewMessage(
    webviewView: vscode.WebviewView,
    msg: WebviewIncomingMessage,
  ): Promise<void> {
    if (msg.type === "webviewReady") {
      this.logUi("webviewReady — restauration session si configurée");
      void this.restoreLastSessionIfAny();
      return;
    }
    if (msg.type === "diagLog" && typeof msg.text === "string") {
      this.logUi(`[webview] ${msg.text}`);
      return;
    }
    if (msg.type === "send") {
      const promptLen =
        typeof msg.prompt === "string" ? msg.prompt.trim().length : 0;
      this.logUi(`send promptLen=${promptLen}`);
      void this.handleSend({
        prompt: typeof msg.prompt === "string" ? msg.prompt : "",
        mode: typeof msg.mode === "string" ? msg.mode : "acceptEdits",
        attachments: Array.isArray(msg.attachments) ? msg.attachments : [],
        references: Array.isArray(msg.references) ? msg.references : [],
        pastes: Array.isArray(msg.pastes) ? msg.pastes : [],
      });
      return;
    }
    if (msg.type === "openPasteSource") {
      await this.openPasteSource(msg);
      return;
    }
    if (msg.type === "userAskAnswer") {
      this.handleUserAskAnswer(msg);
      return;
    }
    if (msg.type === "newChat") {
      this.logUi("newChat");
      this.startNewChat();
      return;
    }
    if (msg.type === "listSessions") {
      this.logUi("listSessions");
      void this.sendSessions();
      return;
    }
    if (msg.type === "loadSession" && typeof msg.sessionId === "string") {
      this.logUi(`loadSession id=${msg.sessionId}`);
      void this.loadSession(msg.sessionId);
      return;
    }
    if (msg.type === "openFile" && typeof msg.filePath === "string") {
      await this.openWorkspaceFile(msg.filePath);
      return;
    }
    if (msg.type === "dropReport") {
      this.logWebviewDropReport(msg);
      return;
    }
    if (msg.type === "pickReferences") {
      await this.pickContextReferences();
      return;
    }
    if (msg.type === "openSettings") {
      this.logUi("openSettings");
      await vscode.commands.executeCommand("drox.openSettings");
      return;
    }
    if (msg.type === "cancelRun") {
      await this.handleCancelRun();
      return;
    }
    if (msg.type === "slash") {
      if (typeof msg.slashInvalid === "string" && msg.slashInvalid.length > 0) {
        this.post("append", { role: "error", text: msg.slashInvalid });
        return;
      }
      const command =
        typeof msg.command === "string" ? msg.command.trim().toLowerCase() : "";
      const args = typeof msg.args === "string" ? msg.args.trim() : "";
      await this.handleSlashCommand(command, args);
      return;
    }
    if (msg.type === "pathComplete") {
      await this.handlePathComplete(webviewView.webview, msg);
      return;
    }
    this.logUi(`← webview type=${msg.type} (non géré)`);
  }

  /** Complétion `@chemin` demandée par la webview (§2.8). */
  private async handlePathComplete(
    webview: vscode.Webview,
    msg: WebviewIncomingMessage,
  ): Promise<void> {
    const requestId =
      typeof msg.requestId === "string" ? msg.requestId : "";
    if (!requestId) {
      return;
    }
    const ws = this.workspaceRoot();
    if (!ws) {
      void webview.postMessage({
        kind: "pathCompleteResult",
        requestId,
        items: [],
        error: "Aucun dossier workspace ouvert.",
      });
      return;
    }
    const query = typeof msg.query === "string" ? msg.query : "";
    const items = await completeWorkspacePaths(ws, query);
    void webview.postMessage({ kind: "pathCompleteResult", requestId, items });
  }

  /** Journalise un drop webview infructueux (types MIME + extraits). */
  private logWebviewDropReport(msg: WebviewIncomingMessage): void {
    this.output.show(true);
    const types = Array.isArray(msg.types) ? msg.types : [];
    const extracted =
      typeof msg.extracted === "number" ? msg.extracted : undefined;
    this.output.appendLine("");
    this.output.appendLine(
      `[webview drop] aucune référence extraite (extracted=${String(extracted)})`,
    );
    this.output.appendLine(`  types (${types.length}): ${types.join(" | ") || "(vide)"}`);
    const snippets = Array.isArray(msg.snippets) ? msg.snippets : [];
    for (const s of snippets) {
      const mime = typeof s.mime === "string" ? s.mime : "?";
      const preview =
        typeof s.preview === "string" ? s.preview : String(s.preview ?? "");
      const short =
        preview.length > 1200 ? preview.slice(0, 1200) + "…" : preview;
      this.output.appendLine(`  --- ${mime} ---`);
      for (const line of short.split("\n")) {
        this.output.appendLine(`    ${line}`);
      }
    }
    this.output.appendLine(
      "  Astuce : Palette (Ctrl+Maj+P) → « Drox: Ajouter des références (fichiers/dossiers) ».",
    );
    this.output.appendLine(
      "  DevTools webview : Palette → « Developer: Open Webview Developer Tools » (vue Drox active).",
    );
  }

  private async ensureClient(): Promise<DroxRpcClient> {
    const ws = this.workspaceRoot();
    if (!ws) {
      throw new Error("Aucun dossier workspace ouvert.");
    }

    if (this.client) {
      return this.client;
    }
    if (this.initPromise) {
      await this.initPromise;
      if (this.client) {
        return this.client;
      }
    }

    const exe = await resolveDroxExecutable(
      ws,
      getConfiguredExecutablePath(),
      this.extensionUri.fsPath,
    );
    this.output.appendLine(`[drox] spawn: ${exe}`);
    let started: DroxRpcClient | undefined;
    const wsUri = vscode.Uri.file(ws);
    const settings = getLlmSettings(wsUri);
    const envOverrides = settingsToEnv(settings);
    this.initPromise = (async () => {
      started = new DroxRpcClient(exe, ws, envOverrides);
      this.client = started;

      const clientTools = new ClientToolRegistry();
      const longMem = await this.longMemoryForWorkspace(ws);
      this.registerClientTools(clientTools, wsUri, longMem);
      attachClientTools(started, clientTools);

      // Sprint Questions bloquantes (§2.13) — handler de la requête
      // serveur→client `user/ask`. Le moteur l'envoie quand le tool
      // `ask_user_question` est invoqué ; on relaie à la webview et on
      // attend la réponse de l'utilisateur (clic Continuer / Esc Ignorer).
      // Une promesse pending tient la connexion JSON-RPC ouverte (le
      // serveur attend `result` ou `error`) — pas de timeout dur côté
      // extension : c'est l'utilisateur qui décide quand répondre.
      started.setRequestHandler("user/ask", (params) =>
        this.handleUserAsk(params),
      );

      started.on("log", (chunk: string) => {
        this.output.append(chunk);
      });

      started.on("error", (err: Error) => {
        void vscode.window.showErrorMessage(`Drox: ${err.message}`);
      });

      started.on("notification", (method: string, params: unknown) => {
        if (method === "agent/event") {
          const p = params as {
            event?: Record<string, unknown>;
          };
          const ev = p.event;
          if (!ev || typeof ev.kind !== "string") {
            return;
          }
          const kind = ev.kind;
          if (kind === "phase_close") {
            this.post("phase", { close: true });
            return;
          }
          if (kind === "phase_enter" && typeof ev.phase === "string") {
            this.post("phase", { phase: ev.phase });
            return;
          }
          if (kind === "run_objective" && typeof ev.text === "string") {
            this.post("runObjective", { text: ev.text });
            return;
          }
          if (kind === "scope_parking_update" && Array.isArray(ev.items)) {
            this.post("scopeParkingUpdate", { items: ev.items });
            return;
          }
          if (kind === "text_delta" && typeof ev.text === "string") {
            this.post("delta", { text: ev.text });
            return;
          }
          if (kind === "tool_start") {
            const name = typeof ev.name === "string" ? ev.name : "?";
            const id = ev.id != null ? String(ev.id) : "?";
            const args = "arguments" in ev ? ev.arguments : undefined;
            const { verb, target } = describeToolCall(name, args);
            if (id !== "?") {
              this.pendingTools.set(id, { name, args });
            }
            if (name === "file_edit" || name === "file_write" || name === "notebook_edit") {
              this.output.appendLine(
                `[diag] tool_start: ${name} id=${id} target=${target}`,
              );
            }
            // `todo_write` est rendu comme un bloc UI dédié (carte de tâches
            // qui s'update en place), pas comme une ligne d'event tool
            // ordinaire. On laisse `pendingTools` pour la corrélation au
            // finish mais on ne pousse RIEN dans la webview ici.
            if (
              name === "todo_write" ||
              name === "course_plan_write" ||
              name === "scope_defer"
            ) {
              return;
            }
            // Pour `file_edit` / `file_write` / `notebook_edit`, le rendu riche se fait hors
            // phase via l'event `fileChange` (diff stylé). On évite d'envoyer
            // le `argsPreview` (qui contient le contenu intégral ou la liste
            // des edits sérialisée) — sinon on retrouve un gros dump JSON
            // dans le bloc tool de la phase, illisible et redondant. Le
            // summary compact (`Wrote path/file`, `Edited path/file`) suffit.
            const isFileMutation =
              name === "file_edit" ||
              name === "file_write" ||
              name === "notebook_edit";
            this.post("tool", {
              phase: "start",
              name,
              id,
              verb,
              target,
              argsPreview: isFileMutation ? "" : previewJson(args),
            });
            return;
          }
          if (kind === "tool_finish") {
            const id = ev.id != null ? String(ev.id) : "?";
            const output = "output" in ev ? ev.output : undefined;
            const evRec = ev as Record<string, unknown>;
            const isError = Boolean(evRec.is_error ?? evRec.isError);
            if (this.maybePostTodoUpdate(id, output, isError)) {
              return;
            }
            if (this.maybePostCoursePlanUpdate(id, output, isError)) {
              return;
            }
            if (this.maybePostScopeDeferFinish(id, output, isError)) {
              return;
            }
            const pending = this.takePendingForFileFinish(id, output);
            this.maybePostFileChange(pending, output, isError, id);
            // Sur file_edit / file_write / notebook_edit réussi, on a déjà posté un
            // `fileChange` qui rend le diff complet hors phase. On évite
            // de renvoyer en plus l'`outputPreview` (objet `{ edits_applied,
            // diff, ... }` ou `{ bytes_written, ... }`) dans le bloc tool de
            // la phase Acting — sinon on a une duplication illisible. On
            // garde uniquement le preview en cas d'**erreur** : le message
            // d'erreur est précieux pour comprendre ce qui a coincé.
            const pendingName = pending?.name;
            const isFileMutationFinish =
              pendingName === "file_edit" ||
              pendingName === "file_write" ||
              pendingName === "notebook_edit";
            const outputPreview =
              isFileMutationFinish && !isError ? "" : previewJson(output);
            this.post("tool", {
              phase: "finish",
              id,
              isError,
              outputPreview,
            });
            return;
          }
          if (kind === "context_usage") {
            const tokens = Number(ev.parent_tokens ?? 0);
            if (tokens > 0) {
              this.post("context", { tokensUsed: tokens });
            }
            return;
          }
          if (kind === "context_snip") {
            const freed = Number(ev.tokens_freed ?? 0);
            const snipped = Number(ev.blocks_snipped ?? 0);
            const after = Number(ev.tokens_used_after ?? 0);
            this.post("context", { tokensUsed: after });
            this.post("append", {
              role: "system",
              text: `[contexte] snip: ~${freed} jetons libérés, ${snipped} blocs, ~${after} jetons après`,
            });
            return;
          }
          if (kind === "context_compacted") {
            const before = Number(ev.tokens_before ?? 0);
            const after = Number(ev.tokens_after ?? 0);
            const removed = Number(ev.messages_removed ?? 0);
            this.post("context", { tokensUsed: after });
            const usage = (ev.usage ?? undefined) as
              | Record<string, unknown>
              | undefined;
            if (usage) {
              const inputTokens = Number(
                usage.input_tokens ?? usage.inputTokens ?? 0,
              );
              const outputTokens = Number(
                usage.output_tokens ?? usage.outputTokens ?? 0,
              );
              if (inputTokens > 0 || outputTokens > 0) {
                this.post("usage", { inputTokens, outputTokens });
              }
            }
            this.post("append", {
              role: "system",
              text: `[contexte] compaction proactive: ~${before} → ~${after} jetons, ${removed} message(s) résumée(s)`,
            });
            const ccs = ev.context_chunk_summary ?? ev.contextChunkSummary;
            if (ccs && typeof ccs === "object" && !Array.isArray(ccs)) {
              void this.ingestContextChunkSummary(ws, ccs as Record<string, unknown>);
            }
            return;
          }
          if (kind === "memory_persisted") {
            // Sprint M1 — résumé de session archivé sur disque. Chip
            // discret dans le fil de chat avec le slug + chemin cliquable
            // (l'utilisateur peut relire le .md s'il veut).
            const slug = String(ev.slug ?? "");
            const path = String(ev.path ?? "");
            const objective = String(ev.objective ?? "");
            this.post("memory", { slug, path, objective });
            return;
          }
          if (kind === "stop") {
            const usage = (ev.usage ?? {}) as Record<string, unknown>;
            const inputTokens = Number(usage.input_tokens ?? 0);
            const outputTokens = Number(usage.output_tokens ?? 0);
            this.post("usage", { inputTokens, outputTokens });
            return;
          }
        }
        if (method === "agent/done") {
          const p = params as { status?: string; error?: string };
          if (p.status === "error" && p.error) {
            this.post("append", { role: "error", text: p.error });
          }
          this.currentRunId = undefined;
          const doReset = p.status !== "error" && this.pendingSessionReset;
          if (doReset) {
            this.pendingSessionReset = false;
          }
          this.post("state", { busy: false });
          if (doReset) {
            this.startNewChat();
          }
          return;
        }
      });

      started.on("exit", () => {
        this.client = undefined;
        this.initPromise = undefined;
        this.currentRunId = undefined;
        this.post("state", { busy: false });
        this.resolvePendingUserAskAsSkipped();
      });

      await started.initialize({
        executableTools: clientTools.executableToolNames(),
        interactiveAsk: true,
      });
    })();

    try {
      await this.initPromise;
    } catch (e) {
      started?.dispose();
      this.client = undefined;
      this.initPromise = undefined;
      throw e;
    }

    if (!this.client) {
      throw new Error("client non initialisé");
    }
    return this.client;
  }

  private async handleSend(payload: {
    prompt: string;
    mode: string;
    attachments: AttachmentPayload[];
    references: ReferencePayload[];
    pastes: PasteAttachmentPayload[];
  }): Promise<void> {
    this.logUi("handleSend début");
    // Interrompt un replay historique en cours pour libérer la webview.
    this.sessionLoadGeneration += 1;
    this.replayingTranscript = false;
    this.post("replay", { active: false, fileDiffs: false });

    const trimmed = payload.prompt.trim();
    const hasAttachments = payload.attachments.length > 0;
    const hasReferences = payload.references.length > 0;
    const hasPastes = payload.pastes.length > 0;
    if (!trimmed && !hasAttachments && !hasReferences && !hasPastes) {
      return;
    }

    const ws = this.workspaceRoot();
    if (!ws) {
      void vscode.window.showErrorMessage(
        "Ouvrez un dossier workspace avant d’utiliser Drox.",
      );
      return;
    }

    const mode = VALID_MODES.has(payload.mode) ? payload.mode : "acceptEdits";
    const courseStore = getCourseCycleStore();
    courseStore.setTrackingEnabled(mode === "professor");
    if (mode === "professor") {
      void courseStore.ensureCycle(ws).then(() => this.postCourseCycleState());
    } else {
      this.postCourseCycleState();
    }

    this.post("state", { busy: true });
    this.post("clearAssistant", {});

    let displayed = trimmed;
    let finalPrompt = trimmed;
    let savedPaths: string[] = [];
    let referenceCount = 0;
    const imagesPayload: AgentRunImage[] = [];
    if (hasAttachments) {
      try {
        const persisted = await this.persistAttachments(ws, payload.attachments);
        savedPaths = persisted.map((p) => p.relPath);
        for (const p of persisted) {
          imagesPayload.push({ mime: p.mime, data: p.base64 });
        }
      } catch (e) {
        this.post("append", {
          role: "error",
          text: `Échec d’enregistrement des images : ${e instanceof Error ? e.message : String(e)}`,
        });
        this.post("state", { busy: false });
        return;
      }
      const list = savedPaths.map((p) => `- ${p}`).join("\n");
      finalPrompt = trimmed
        ? `${trimmed}\n\n[Images jointes]\n${list}`
        : `[Images jointes]\n${list}`;
      const tail = savedPaths.length === 1 ? "1 image" : `${savedPaths.length} images`;
      displayed = trimmed
        ? `${trimmed}\n📎 ${tail} jointe${savedPaths.length > 1 ? "s" : ""}`
        : `📎 ${tail} jointe${savedPaths.length > 1 ? "s" : ""}`;
    }

    if (hasPastes) {
      const { promptBlock, displayLines } = this.formatPastesForPrompt(
        payload.pastes,
        ws,
      );
      if (promptBlock) {
        finalPrompt = finalPrompt
          ? `${finalPrompt}\n\n${promptBlock}`
          : promptBlock;
      }
      if (displayLines.length > 0) {
        const head = displayLines.join("\n");
        displayed = displayed ? `${displayed}\n${head}` : head;
      }
    }

    if (hasReferences) {
      const resolved = await this.resolveReferences(ws, payload.references);
      referenceCount = resolved.length;
      if (resolved.length > 0) {
        const list = resolved
          .map((r) => {
            const kindLabel = r.kind === "directory" ? "dossier" : "fichier";
            const where = r.inWorkspace
              ? ` (relatif au workspace : \`${r.rel}\`)`
              : "";
            return `- ${kindLabel} : \`${r.abs}\`${where}`;
          })
          .join("\n");
        const block =
          `[Références utilisateur]\n` +
          `Workspace racine : \`${ws}\`\n` +
          `${list}\n` +
          `Note : utilise ces chemins **absolus** dans tes outils ` +
          `(file_read, glob, bash). Évite \`./\` qui dépend du cwd du shell.`;
        finalPrompt = finalPrompt ? `${finalPrompt}\n\n${block}` : block;

        const head = resolved.length === 1 ? "1 référence" : `${resolved.length} références`;
        const items = resolved.map((r) => r.rel).join(", ");
        const refLine = `📁 ${head} : ${items}`;
        displayed = displayed ? `${displayed}\n${refLine}` : refLine;
      }
    }

    this.post(
      "userPromptSticky",
      buildUserPromptStickyPayload(
        displayed,
        trimmed,
        savedPaths.length,
        referenceCount,
        payload.pastes.length,
      ),
    );
    const runObjective = extractRunObjective(trimmed);
    if (runObjective) {
      this.post("runObjective", { text: runObjective });
    }
    this.post("append", { role: "user", text: displayed });

    if (!this.currentSessionId) {
      this.currentSessionId = newSessionId();
      this.post("session", { id: this.currentSessionId });
      this.persistCurrentSessionForRestore();
    }

    try {
      const client = await this.ensureClient();
      const wsUri = vscode.Uri.file(ws);
      const settings = getLlmSettings(wsUri);
      const disabledTools = getDisabledToolsForRun(wsUri);
      const subagents = getSubagentSettings(wsUri);
      const runParams: AgentRunParams = {
        prompt: finalPrompt,
        workspace: ws,
        mode,
        applyEdits: mode !== "professor",
        sessionId: this.currentSessionId,
        maxIterations: settings.maxIterations,
        server: settings.server || undefined,
        model: settings.model || undefined,
        apiKey: settings.apiKey || undefined,
        temperature: settings.temperature ?? undefined,
        maxTokens: settings.maxTokens ?? undefined,
        images: imagesPayload.length > 0 ? imagesPayload : undefined,
        nativeThinking: settings.nativeThinking,
        disabledTools:
          disabledTools.length > 0 ? disabledTools : undefined,
        mcpToolsEnabled: isMcpToolsEnabled(wsUri),
        runObjective,
        subagentsEnabled: subagents.enabled || undefined,
        subagentsMaxIterations: subagents.enabled
          ? subagents.maxIterations
          : undefined,
        subagentsMaxConcurrent: subagents.enabled
          ? subagents.maxConcurrent
          : undefined,
        subagentsModel: subagents.model ? subagents.model : undefined,
        subagentsNumCtx: subagents.enabled ? subagents.numCtx : undefined,
      };
      const { runId } = await client.agentRun(runParams);
      this.currentRunId = runId;
      this.logUi(`handleSend agent.run OK runId=${runId}`);
    } catch (e) {
      this.logUiError("handleSend agent.run", e);
      this.post("append", {
        role: "error",
        text: e instanceof Error ? e.message : String(e),
      });
      this.currentRunId = undefined;
      this.post("state", { busy: false });
    }
  }

  /**
   * Annule le run en cours (bouton « Stop » de la webview). Si aucun run
   * n'est actif côté chatView, on émet juste un `state: busy=false` pour
   * resynchroniser l'UI au cas où elle se serait désynchronisée.
   */
  private async handleCancelRun(): Promise<void> {
    const runId = this.currentRunId;
    if (!runId || !this.client) {
      this.post("state", { busy: false });
      this.currentRunId = undefined;
      return;
    }
    this.output.appendLine(`[drox] agent.cancel runId=${runId}`);
    try {
      await this.client.agentCancel(runId);
    } catch (e) {
      this.output.appendLine(
        `[drox] agent.cancel error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    // On laisse la notification `agent/done { status: "cancelled" }`
    // remettre `busy: false`. En backup, on force aussi tout de suite pour
    // ne pas laisser l'UI verrouillée si le moteur tarde.
    this.currentRunId = undefined;
    this.post("append", { role: "system", text: "Drox: run annulé par l'utilisateur." });
    this.post("state", { busy: false });
    // Si un run en cours avait posté une carte Questions, on la résout
    // toutes-skippées pour libérer côté serveur (sinon `user/ask` resterait
    // pending indéfiniment côté Rust).
    this.resolvePendingUserAskAsSkipped();
  }

  /**
   * Slash commands webview (backlog §2.3) — exécutés côté extension, hors
   * `agent.run` (sauf la compaction qui appelle `session.compact`).
   */
  private async handleSlashCommand(command: string, args: string): Promise<void> {
    if (!command) {
      return;
    }
    const ws = this.workspaceRoot();
    if (!ws) {
      void vscode.window.showErrorMessage(
        "Ouvrez un dossier workspace avant d'utiliser les commandes /.",
      );
      return;
    }
    const wsUri = vscode.Uri.file(ws);

    switch (command) {
      case "help":
      case "?":
        this.post("append", {
          role: "system",
          text:
            "Commandes **/** disponibles :\n\n" +
            "- `/help` — cette aide\n" +
            "- `/clear` ou `/new` — nouvelle conversation (reset UI)\n" +
            "- `/model [id]` — afficher ou définir le modèle workspace (`drox.architect.model`)\n" +
            "- `/init` — créer `.drox`, `MEMORY.md`, `DROX.md` s'ils manquent\n" +
            "- `/memory` — ouvrir `MEMORY.md`\n" +
            "- `/compact` — compaction LLM du transcript de la session (`session.compact`)\n" +
            "- Le modèle peut aussi appeler l'outil **`session_compact`** (même effet que `/compact`)\n" +
            "- `/session_end` ou `/end-session` — avant clôture : compaction LLM du transcript restant (comme `/compact`), archivage mémoire longue, puis nouveau fil ; texte optionnel après la commande = indice d'au revoir archivé\n" +
            "- `/course_undo` — annuler les mutations disque du cycle professeur en cours (`.drox/course-cycles/`)\n" +
            "- `/course_end` — clôturer le cycle professeur sans restaurer les fichiers",
        });
        return;

      case "clear":
      case "new":
        this.startNewChat();
        this.post("append", {
          role: "system",
          text: "Nouvelle conversation — session locale réinitialisée.",
        });
        return;

      case "model": {
        const cfg = vscode.workspace.getConfiguration("drox", wsUri);
        if (args.length > 0) {
          await cfg.update(
            "architect.model",
            args,
            vscode.ConfigurationTarget.Workspace,
          );
          this.post("append", {
            role: "system",
            text: `Modèle Architecte enregistré : \`${args}\`.`,
          });
        } else {
          const cur = getArchitectModel(wsUri);
          this.post("append", {
            role: "system",
            text: cur
              ? `Modèle actuel (workspace) : \`${cur}\`. Pour changer : \`/model <nom>\`.`
              : "Aucun `drox.architect.model` défini pour ce workspace — valeurs par défaut / `.drox/env`.",
          });
        }
        return;
      }

      case "init":
        await this.scaffoldDroxMemdir(wsUri);
        return;

      case "memory": {
        const memoryUri = vscode.Uri.joinPath(wsUri, "MEMORY.md");
        try {
          await vscode.workspace.fs.stat(memoryUri);
        } catch {
          const enc = new TextEncoder();
          await vscode.workspace.fs.writeFile(
            memoryUri,
            enc.encode(
              "# Mémoire projet (Drox)\n\nDécrivez ici objectifs, conventions et décisions stables.\n",
            ),
          );
        }
        const doc = await vscode.workspace.openTextDocument(memoryUri);
        await vscode.window.showTextDocument(doc, { preview: false });
        this.post("append", { role: "system", text: "Fichier `MEMORY.md` ouvert." });
        return;
      }

      case "compact": {
        if (!this.currentSessionId) {
          this.post("append", {
            role: "system",
            text:
              "Pas d'identifiant de session — envoyez au moins un message, puis relancez `/compact` lorsqu'un transcript existe.",
          });
          return;
        }
        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Window,
              title: "Drox — compaction de session",
            },
            async () => {
              const client = await this.ensureClient();
              const settings = getLlmSettings(wsUri);
              const res = await client.sessionCompact({
                id: this.currentSessionId!,
                server: settings.server || undefined,
                model: settings.model || undefined,
                apiKey: settings.apiKey || undefined,
              });
              let text =
                "**Compaction manuelle** (`session.compact`)\n\n" + res.summary;
              if (res.objective) {
                text = `**Objectif** (extrait) : ${res.objective}\n\n` + text;
              }
              if (res.filesTouched && res.filesTouched.length > 0) {
                text +=
                  "\n\n**Fichiers mentionnés** : " +
                  res.filesTouched.map((f) => `\`${f}\``).join(", ");
              }
              if (res.usage) {
                text += `\n\n_(tokens compaction ↑${res.usage.inputTokens} ↓${res.usage.outputTokens})_`;
              }
              if (text.length > 20_000) {
                text = text.slice(0, 20_000) + "\n\n…_(tronqué)_";
              }
              this.post("append", { role: "system", text });
            },
          );
        } catch (e) {
          this.post("append", {
            role: "error",
            text: e instanceof Error ? e.message : String(e),
          });
        }
        return;
      }

      case "session_end":
      case "end-session": {
        if (this.currentRunId) {
          this.post("append", {
            role: "error",
            text:
              "Un run est en cours — utilisez **Stop**, attendez la fin, puis relancez `/session_end`.",
          });
          return;
        }
        if (!this.currentSessionId) {
          this.post("append", {
            role: "system",
            text:
              "Pas d'identifiant de session — envoyez au moins un message dans ce fil, puis `/session_end`.",
          });
          return;
        }
        const sid = this.currentSessionId;
        try {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Window,
              title: "Drox — clôture de session",
            },
            async () => {
              try {
                const res = await this.sessionCompactCurrentWorkspace(wsUri, sid);
                await this.ingestLongMemoryAfterSessionCompact(ws, sid, res);
              } catch (e) {
                this.output.appendLine(
                  `[drox] pré-compact avant session_end: ${e instanceof Error ? e.message : String(e)}`,
                );
              }
              const store = await this.longMemoryForWorkspace(ws);
              const { closureId, chunkCount } = await store.closeSession({
                transcriptSessionId: sid,
                farewellHint: args.length > 0 ? args : undefined,
              });
              this.startNewChat();
              this.post("append", {
                role: "system",
                text:
                  `**Session clôturée** (mémoire longue). Clôture \`${closureId}\` — ${chunkCount} segment(s) archivé(s). Nouveau fil au prochain message.`,
              });
            },
          );
        } catch (e) {
          this.post("append", {
            role: "error",
            text: e instanceof Error ? e.message : String(e),
          });
        }
        return;
      }

      case "course_undo": {
        const store = getCourseCycleStore();
        if (!store.getActiveCycleId()) {
          this.post("append", {
            role: "system",
            text: "Aucun cycle professeur actif — passez en mode **Professeur** et envoyez un message pour démarrer un cycle.",
          });
          return;
        }
        try {
          const { restored, removed, cycleId } = await store.undoCycle(ws);
          this.postCourseCycleState();
          this.post("append", {
            role: "system",
            text:
              `**Cycle professeur annulé** (\`${cycleId ?? "?"}\`) — ` +
              `${restored} fichier(s) restauré(s), ${removed} création(s) supprimée(s).`,
          });
        } catch (e) {
          this.post("append", {
            role: "error",
            text: e instanceof Error ? e.message : String(e),
          });
        }
        return;
      }

      case "course_end": {
        const store = getCourseCycleStore();
        const cycleId = store.getActiveCycleId();
        store.endCycle();
        store.setTrackingEnabled(false);
        this.postCourseCycleState();
        this.post("append", {
          role: "system",
          text: cycleId
            ? `Cycle professeur \`${cycleId}\` clôturé (fichiers conservés).`
            : "Aucun cycle professeur actif.",
        });
        return;
      }

      default:
        this.post("append", {
          role: "system",
          text: `Commande inconnue : \`/${command}\`. Tapez \`/help\`.`,
        });
    }
  }

  private async scaffoldDroxMemdir(wsUri: vscode.Uri): Promise<void> {
    const droxDir = vscode.Uri.joinPath(wsUri, ".drox");
    try {
      await vscode.workspace.fs.createDirectory(droxDir);
    } catch {
      /* dossier déjà présent ou indisponible */
    }
    const memoryUri = vscode.Uri.joinPath(wsUri, "MEMORY.md");
    try {
      await vscode.workspace.fs.stat(memoryUri);
    } catch {
      const enc = new TextEncoder();
      await vscode.workspace.fs.writeFile(
        memoryUri,
        enc.encode(
          "# Mémoire projet\n\n## Objectifs\n\n## Décisions\n\n## Notes\n\n",
        ),
      );
    }
    const droxMd = vscode.Uri.joinPath(wsUri, "DROX.md");
    try {
      await vscode.workspace.fs.stat(droxMd);
    } catch {
      const enc = new TextEncoder();
      await vscode.workspace.fs.writeFile(
        droxMd,
        enc.encode("# Instructions Drox\n\nRègles spécifiques à ce dépôt.\n\n"),
      );
    }
    this.post("append", {
      role: "system",
      text: "Initialisation : dossier `.drox` et fichiers `MEMORY.md` / `DROX.md` vérifiés ou créés.",
    });
  }

  /**
   * Sprint Questions bloquantes (§2.13) — handler de requête entrante
   * `user/ask`. Affiche la carte « Questions » dans la webview et résout
   * une promesse quand l'utilisateur clique Continuer (ou Esc/Ignorer).
   *
   * Un seul `user/ask` à la fois est attendu (le moteur n'en envoie pas
   * un nouveau tant que la réponse n'est pas reçue). Si pour une raison
   * exotique une nouvelle requête arrive alors qu'une précédente est
   * encore pending, on skip la précédente et on prend la nouvelle.
   */
  private async handleUserAsk(
    params: unknown,
  ): Promise<{ result: unknown } | { error: { code: number; message: string } }> {
    const p = (params ?? {}) as {
      runId?: string;
      askId?: string;
      title?: string;
      questions?: Array<{
        id?: string;
        prompt?: string;
        options?: Array<{ id?: string; label?: string }>;
        allowMultiple?: boolean;
        allowFreeText?: boolean;
      }>;
    };
    const askId = typeof p.askId === "string" ? p.askId : "";
    const rawQuestions = Array.isArray(p.questions) ? p.questions : [];
    if (!askId || rawQuestions.length === 0) {
      return {
        error: {
          code: -32602,
          message: "user/ask params must include `askId` and a non-empty `questions[]`",
        },
      };
    }

    const questions = rawQuestions.map((q, i) => ({
      id: typeof q.id === "string" && q.id ? q.id : `q${i + 1}`,
      prompt: typeof q.prompt === "string" ? q.prompt : "",
      options: Array.isArray(q.options)
        ? q.options.map((o, j) => ({
            id: typeof o.id === "string" && o.id ? o.id : `opt${j + 1}`,
            label: typeof o.label === "string" ? o.label : "",
          }))
        : [],
      allowMultiple: Boolean(q.allowMultiple),
      allowFreeText: Boolean(q.allowFreeText),
    }));

    if (this.pendingUserAsk) {
      this.resolvePendingUserAskAsSkipped();
    }

    this.post("userAsk", {
      askId,
      runId: typeof p.runId === "string" ? p.runId : "",
      title: typeof p.title === "string" ? p.title : null,
      questions,
    });

    const answers = await new Promise<
      Array<{
        id: string;
        optionIds: string[];
        freeText: string;
        skipped: boolean;
      }>
    >((resolve) => {
      this.pendingUserAsk = {
        askId,
        questions: questions.map((q) => ({
          id: q.id,
          options: q.options.map((o) => ({ id: o.id })),
        })),
        resolve,
      };
    });

    return { result: { answers } };
  }

  /**
   * Réception de `userAskAnswer` depuis la webview. Valide le `askId` (au
   * cas où la webview enverrait une réponse en retard pour une carte déjà
   * skippée) puis résout la promesse pending.
   */
  private handleUserAskAnswer(msg: {
    askId?: string;
    answers?: Array<{
      id: string;
      optionIds?: string[];
      freeText?: string;
      skipped?: boolean;
    }>;
  }): void {
    const pending = this.pendingUserAsk;
    if (!pending) return;
    if (typeof msg.askId === "string" && msg.askId !== pending.askId) {
      return;
    }
    const provided = Array.isArray(msg.answers) ? msg.answers : [];
    const byId = new Map(provided.map((a) => [a.id, a]));
    const answers = pending.questions.map((q) => {
      const a = byId.get(q.id);
      const optionIds = Array.isArray(a?.optionIds) ? (a!.optionIds as string[]) : [];
      const validIds = new Set(q.options.map((o) => o.id));
      return {
        id: q.id,
        optionIds: optionIds.filter((id) => validIds.has(id)),
        freeText: typeof a?.freeText === "string" ? a!.freeText : "",
        skipped: Boolean(a?.skipped),
      };
    });
    this.pendingUserAsk = undefined;
    pending.resolve(answers);
  }

  /** Résout l'éventuel `user/ask` pending avec toutes les réponses skippées. */
  private resolvePendingUserAskAsSkipped(): void {
    const pending = this.pendingUserAsk;
    if (!pending) return;
    this.pendingUserAsk = undefined;
    pending.resolve(
      pending.questions.map((q) => ({
        id: q.id,
        optionIds: [],
        freeText: "",
        skipped: true,
      })),
    );
  }

  /**
   * Sauvegarde les images en `<workspace>/.drox/attachments/<ts>-<i>-<name>`
   * et renvoie pour chacune le chemin relatif (POSIX, pour citation dans le
   * prompt), le `mime` et la **base64 brute** (sans préfixe `data:`) destinée
   * à être envoyée au moteur via `agent.run.images`.
   */
  private async persistAttachments(
    workspaceRoot: string,
    attachments: AttachmentPayload[],
  ): Promise<Array<{ relPath: string; mime: string; base64: string }>> {
    const dirUri = vscode.Uri.file(
      path.join(workspaceRoot, ".drox", "attachments"),
    );
    await vscode.workspace.fs.createDirectory(dirUri);

    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);

    const saved: Array<{ relPath: string; mime: string; base64: string }> = [];
    let i = 0;
    for (const att of attachments) {
      i += 1;
      const dataUrl = typeof att.dataUrl === "string" ? att.dataUrl : "";
      const decoded = decodeDataUrl(dataUrl);
      if (!decoded) {
        continue;
      }
      const mime = att.mime ?? decoded.mime ?? "image/png";
      const base = sanitizeFileName(att.name ?? `image-${i}`);
      const hasExt = path.extname(base) !== "";
      const fileName = `${ts}-${i}-${base}${hasExt ? "" : extFromMime(mime)}`;
      const fileUri = vscode.Uri.file(path.join(dirUri.fsPath, fileName));
      await vscode.workspace.fs.writeFile(fileUri, decoded.bytes);
      const rel = path
        .relative(workspaceRoot, fileUri.fsPath)
        .replaceAll("\\", "/");
      const base64 = Buffer.from(decoded.bytes).toString("base64");
      saved.push({ relPath: `./${rel}`, mime, base64 });
    }
    return saved;
  }

  /**
   * Résout les références (URIs glissées depuis l'Explorateur) en chemins
   * lisibles + détecte fichier vs dossier. Les entrées hors workspace sont
   * conservées avec leur chemin absolu.
   */
  private async resolveReferences(
    workspaceRoot: string,
    refs: ReferencePayload[],
  ): Promise<
    Array<{
      uri: string;
      rel: string;
      abs: string;
      kind: "file" | "directory";
      inWorkspace: boolean;
    }>
  > {
    const out: Array<{
      uri: string;
      rel: string;
      abs: string;
      kind: "file" | "directory";
      inWorkspace: boolean;
    }> = [];
    const seen = new Set<string>();

    for (const ref of refs) {
      const raw = typeof ref.uri === "string" ? ref.uri.trim() : "";
      if (!raw) continue;

      let uri: vscode.Uri;
      try {
        uri = raw.startsWith("file://") || raw.includes("://")
          ? vscode.Uri.parse(raw)
          : vscode.Uri.file(raw);
      } catch {
        continue;
      }

      const fsPath = uri.fsPath;
      if (seen.has(fsPath)) continue;
      seen.add(fsPath);

      let kind: "file" | "directory" = "file";
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        kind = stat.type === vscode.FileType.Directory ? "directory" : "file";
      } catch {
        continue;
      }

      const normalizedWs = workspaceRoot.replaceAll("\\", "/");
      const normalizedPath = fsPath.replaceAll("\\", "/");
      let rel: string;
      let inWorkspace = false;
      if (
        normalizedPath === normalizedWs ||
        normalizedPath.startsWith(normalizedWs + "/")
      ) {
        const inside = normalizedPath.slice(normalizedWs.length).replace(/^\/+/, "");
        rel = inside.length > 0 ? `./${inside}` : "./";
        inWorkspace = true;
      } else {
        rel = normalizedPath;
      }

      out.push({ uri: raw, rel, abs: fsPath, kind, inWorkspace });
    }

    return out;
  }

  /**
   * Sprint Smart paste (§2.9) — transforme les `pastes` en bloc prompt + lignes
   * d'affichage **courtes** (référence par chemin / terminal + plage `Lx-y`,
   * pas le texte intégral dans la bulle utilisateur).
   *
   * Éditeur : petit extrait (≤ 20 l., ≤ 4 000 car.) → code fence inline ;
   * sinon → référence `file_read` avec plage de lignes.
   * Terminal : contenu toujours inline (pas de fichier) ; affichage chip =
   * nom du terminal + `L1-N`.
   */
  private formatPastesForPrompt(
    pastes: PasteAttachmentPayload[],
    workspaceRoot: string,
  ): { promptBlock: string; displayLines: string[] } {
    const blocks: string[] = [];
    const displayLines: string[] = [];
    const INLINE_MAX_LINES = 20;
    const INLINE_MAX_CHARS = 4_000;

    for (const p of pastes) {
      const text = typeof p.text === "string" ? p.text : "";
      const kind = p.kind === "terminal" ? "terminal" : "editor";
      const lineCount =
        typeof p.lineCount === "number" && p.lineCount > 0
          ? Math.floor(p.lineCount)
          : Math.max(1, text.split(/\r?\n/).length);
      const startLine =
        typeof p.startLine === "number" && p.startLine > 0
          ? Math.floor(p.startLine)
          : 1;
      const endLine =
        typeof p.endLine === "number" && p.endLine >= startLine
          ? Math.floor(p.endLine)
          : startLine + lineCount - 1;
      const lang = typeof p.languageId === "string" ? p.languageId : "plaintext";
      const absPath = typeof p.absPath === "string" ? p.absPath : "";
      const lineRef =
        startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`;

      if (kind === "terminal") {
        const termName =
          typeof p.relPath === "string" && p.relPath.trim()
            ? p.relPath.trim()
            : "Terminal";
        if (text) {
          blocks.push(
            `**Smart paste (terminal)** — \`${termName}\` (${lineRef}, ${lineCount} l.) :\n` +
              "```shellsession\n" +
              text.replace(/\r\n/g, "\n") +
              (text.endsWith("\n") ? "" : "\n") +
              "```",
          );
        }
        displayLines.push(`⌨ ${termName} · ${lineRef}`);
        continue;
      }

      const fallbackRel = typeof p.relPath === "string" ? p.relPath : null;
      const rel = (() => {
        if (fallbackRel) return fallbackRel.replace(/^\.\//, "");
        if (!absPath || absPath === TERMINAL_SMART_PASTE_ABS_SENTINEL) {
          return null;
        }
        const ws = workspaceRoot.replace(/\\/g, "/");
        const abs = absPath.replace(/\\/g, "/");
        if (abs === ws || abs.startsWith(ws + "/")) {
          return abs.slice(ws.length).replace(/^\/+/, "");
        }
        return null;
      })();
      const refPath = rel ?? absPath;
      const readPath = rel ?? absPath;
      const small =
        lineCount <= INLINE_MAX_LINES && text.length <= INLINE_MAX_CHARS;

      if (small && text) {
        const fenceLang = `${lang}:${startLine}-${endLine}:${refPath}`;
        blocks.push(
          `**Smart paste** — \`${refPath}\` (${lineRef}, ${lineCount} l.) :\n` +
            "```" +
            fenceLang +
            "\n" +
            text.replace(/\r\n/g, "\n") +
            (text.endsWith("\n") ? "" : "\n") +
            "```",
        );
      } else {
        blocks.push(
          `**Smart paste** (référence) — \`${refPath}\` (${lineRef}, ${lineCount} l.). ` +
            `Appelle \`file_read\` sur \`${readPath}\` ` +
            `(lignes ${startLine} à ${endLine}) pour lire l'extrait — ne pas réinventer le contenu.`,
        );
      }
      displayLines.push(`📄 ${refPath} · ${lineRef}`);
    }

    const promptBlock = blocks.length
      ? `[Smart paste — extraits sélectionnés par l'utilisateur]\n${blocks.join("\n\n")}`
      : "";
    return { promptBlock, displayLines };
  }

  /**
   * Clic sur une chip smart-paste : fichier → ouverture + reveal des lignes ;
   * terminal → focus sur le terminal nommé (ou actif).
   */
  private async openPasteSource(msg: {
    kind?: string;
    absPath?: string;
    relPath?: string | null;
    startLine?: number;
    endLine?: number;
  }): Promise<void> {
    const abs = typeof msg.absPath === "string" ? msg.absPath : "";
    const isTerminal =
      msg.kind === "terminal" || abs === TERMINAL_SMART_PASTE_ABS_SENTINEL;

    if (isTerminal) {
      const wantName =
        typeof msg.relPath === "string" ? msg.relPath.trim() : "";
      const terminals = vscode.window.terminals;
      let target: vscode.Terminal | undefined;
      if (wantName) {
        target = terminals.find((t) => t.name === wantName);
      }
      if (!target) {
        target = vscode.window.activeTerminal ?? terminals[terminals.length - 1];
      }
      if (target) {
        target.show(false);
      }
      return;
    }

    if (!abs) return;
    const startLine = Math.max(1, Math.floor(msg.startLine ?? 1)) - 1;
    const endLine = Math.max(startLine, Math.floor(msg.endLine ?? startLine + 1) - 1);
    try {
      const uri = vscode.Uri.file(abs);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, {
        preserveFocus: false,
        preview: false,
      });
      const range = new vscode.Range(startLine, 0, endLine, 0);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    } catch (e) {
      this.output.appendLine(
        `[drox] openPasteSource error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private persistCurrentSessionForRestore(): void {
    void this.extensionContext.workspaceState.update(
      WORKSPACE_LAST_SESSION_KEY,
      this.currentSessionId,
    );
  }

  private clearPersistedSessionForRestore(): void {
    void this.extensionContext.workspaceState.update(
      WORKSPACE_LAST_SESSION_KEY,
      undefined,
    );
  }

  private getPersistedSessionIdForRestore(): string | undefined {
    const raw = this.extensionContext.workspaceState.get<string | undefined>(
      WORKSPACE_LAST_SESSION_KEY,
    );
    return typeof raw === "string" && raw.startsWith("ses_") ? raw : undefined;
  }

  /**
   * Recharge le transcript de la session mémorisée pour ce workspace (rechargement
   * de la fenêtre, recompilation de l’extension, ou première ouverture de la vue).
   */
  private async restoreLastSessionIfAny(): Promise<void> {
    if (!this.view || this.showingNoWorkspaceBanner) {
      return;
    }
    const id = this.getPersistedSessionIdForRestore();
    if (!id) {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
    const ws = this.workspaceRoot();
    const scope = ws ? vscode.Uri.file(ws) : undefined;
    if (!isReplayTranscriptOnLoadEnabled(scope)) {
      this.logUi(`restoreLastSession: attach sans replay (${id})`);
      this.attachSessionWithoutReplay(id, [], undefined, ++this.sessionLoadGeneration);
      this.output.appendLine(
        `[drox] session ${id} rétablie sans replay (drox.replayTranscriptOnLoad=false)`,
      );
      return;
    }
    try {
      await this.loadSession(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.output.appendLine(`[drox] restore session failed: ${msg}`);
      this.post("append", {
        role: "error",
        text: `Impossible de restaurer la session ${id} : ${msg}`,
      });
    }
  }

  /**
   * Rattache une session sans rejouer le transcript (pas d'appel moteur lourd,
   * pas de flood webview).
   */
  private attachSessionWithoutReplay(
    id: string,
    messages: TranscriptMessage[],
    uiStats: SessionUiStatsSnapshot | undefined,
    generation: number,
  ): void {
    if (this.isSessionLoadCancelled(generation)) {
      return;
    }
    this.currentSessionId = id;
    this.persistCurrentSessionForRestore();
    this.pendingTools.clear();
    this.replayingTranscript = false;
    this.post("replay", { active: false, fileDiffs: false });
    this.post("chatReset", {});
    this.post("session", {
      id,
      title:
        messages.length > 0
          ? transcriptPreviewTitle(messages)
          : `${id.replace(/^ses_/, "").slice(0, 12)}…`,
      uiStats,
    });
    const countHint =
      messages.length > 0
        ? `${messages.length} message(s) sur disque.`
        : "Transcript vide.";
    this.post("append", {
      role: "system",
      text:
        `Session reprise (\`${id.slice(0, 20)}…\`). ${countHint} ` +
        "Replay visuel désactivé (`drox.replayTranscriptOnLoad: false`).",
    });
  }

  /** Réinitialise une conversation côté UI (le `session_id` sera créé au prochain envoi). */
  private startNewChat(): void {
    this.sessionLoadGeneration += 1;
    this.replayingTranscript = false;
    this.clearPersistedSessionForRestore();
    this.currentSessionId = undefined;
    this.pendingSessionReset = false;
    this.pendingTools.clear();
    this.resolvePendingUserAskAsSkipped();
    this.post("replay", { active: false, fileDiffs: false });
    this.post("chatReset", {});
    this.post("session", { id: null });
  }

  private isSessionLoadCancelled(generation: number): boolean {
    return generation !== this.sessionLoadGeneration;
  }

  /**
   * Récupère l'entrée `pendingTools` pour un `tool_finish`, d'abord par id,
   * sinon par chemin de fichier (contournement si `tool_start` / `tool_finish`
   * ne partagent pas le même `ToolUseId`).
   */
  private takePendingForFileFinish(
    toolFinishId: string,
    output: unknown,
  ): { name: string; args: unknown } | undefined {
    if (toolFinishId && toolFinishId !== "?" && this.pendingTools.has(toolFinishId)) {
      const p = this.pendingTools.get(toolFinishId)!;
      this.pendingTools.delete(toolFinishId);
      return p;
    }
    const out = normalizeToolFinishOutput(output);
    const outPath =
      out && typeof out.path === "string" ? out.path.replace(/\\/g, "/") : null;
    if (!outPath) {
      return undefined;
    }
    for (const [pid, pend] of this.pendingTools) {
      if (
        pend.name !== "file_write" &&
        pend.name !== "file_edit" &&
        pend.name !== "notebook_edit"
      ) {
        continue;
      }
      const ap = toolArgPath(pend.args);
      if (!ap) {
        continue;
      }
      const apClean = ap.replace(/^\.\/+/, "");
      if (
        outPath === ap ||
        outPath.endsWith("/" + ap) ||
        outPath.endsWith("/" + apClean) ||
        outPath.toLowerCase().endsWith("/" + apClean.toLowerCase())
      ) {
        this.pendingTools.delete(pid);
        return pend;
      }
    }
    return undefined;
  }

  /**
   * Intercepte les `tool_finish` du tool `todo_write` et les transforme en
   * event `todoUpdate` pour la webview (rendu en bloc dédié + sticky), au
   * lieu de la ligne `tool` ordinaire. Renvoie `true` si l'event a été géré
   * comme un todo (et donc qu'il ne faut PAS le re-poster comme tool).
   *
   * Le tool peut aussi être appelé à blanc par d'autres clients (ce moteur
   * exécute des tests / scénarios isolés) : on n'intercepte que si le
   * `pendingTools` confirme `todo_write` OU si le payload ressemble à un
   * output de `todo_write` (champs `todos` + `counts` ou `summary`).
   */
  private maybePostTodoUpdate(
    id: string,
    output: unknown,
    isError: boolean,
  ): boolean {
    const pending =
      id && id !== "?" ? this.pendingTools.get(id) : undefined;
    const isTodoByPending = pending?.name === "todo_write";
    if (!isTodoByPending && !isTodoWriteOutput(output)) {
      return false;
    }
    if (isTodoByPending && id !== "?") {
      this.pendingTools.delete(id);
    }
    if (isError) {
      const msg = extractErrorMessage(output) ?? "validation rejetée";
      this.post("append", {
        role: "error",
        text: `todo_write : ${msg}`,
      });
      return true;
    }
    const todos = extractTodos(output);
    if (!todos) {
      this.output.appendLine(
        `[diag] todo_write finish but output unreadable: ${previewJson(output)}`,
      );
      return true;
    }
    this.post("todoUpdate", { todos });
    return true;
  }

  private maybePostCoursePlanUpdate(
    id: string,
    output: unknown,
    isError: boolean,
  ): boolean {
    const pending =
      id && id !== "?" ? this.pendingTools.get(id) : undefined;
    const isCourseByPending = pending?.name === "course_plan_write";
    if (!isCourseByPending && !isCoursePlanWriteOutput(output)) {
      return false;
    }
    if (isCourseByPending && id !== "?") {
      this.pendingTools.delete(id);
    }
    if (isError) {
      const msg = extractErrorMessage(output) ?? "validation rejetée";
      this.post("append", {
        role: "error",
        text: `course_plan_write : ${msg}`,
      });
      return true;
    }
    const plan = extractCoursePlan(output);
    if (!plan) {
      this.output.appendLine(
        `[diag] course_plan_write finish but output unreadable: ${previewJson(output)}`,
      );
      return true;
    }
    this.post("coursePlanUpdate", {
      courseTitle: plan.courseTitle,
      steps: plan.steps,
    });
    const store = getCourseCycleStore();
    if (store.isTracking()) {
      const root = this.workspaceRoot();
      if (root) {
        void store.ensureCycle(root, plan.courseTitle).then(() =>
          this.postCourseCycleState(),
        );
      }
    }
    return true;
  }

  /**
   * Masque les lignes `tool` pour `scope_defer` — le parking est mis à jour
   * via `scopeParkingUpdate` (événement moteur).
   */
  private maybePostScopeDeferFinish(
    id: string,
    output: unknown,
    isError: boolean,
  ): boolean {
    const pending =
      id && id !== "?" ? this.pendingTools.get(id) : undefined;
    const isScopeByPending = pending?.name === "scope_defer";
    const out =
      output && typeof output === "object"
        ? (output as Record<string, unknown>)
        : null;
    const isScopeByOutput =
      out != null &&
      out.ok === true &&
      typeof out.finding === "string" &&
      typeof out.reason === "string";
    if (!isScopeByPending && !isScopeByOutput) {
      return false;
    }
    if (isScopeByPending && id !== "?") {
      this.pendingTools.delete(id);
    }
    if (isError) {
      const msg = extractErrorMessage(output) ?? "validation rejetée";
      this.post("append", {
        role: "error",
        text: `scope_defer : ${msg}`,
      });
    }
    return true;
  }

  private postCourseCycleState(): void {
    const store = getCourseCycleStore();
    this.post("courseCycleActive", {
      active: store.isTracking() && store.getActiveCycleId() !== null,
      cycleId: store.getActiveCycleId(),
    });
  }

  /**
   * Déduit `file_edit` / `file_write` / `notebook_edit` à partir des champs de l'output, si on
   * n'a pas pu corréler avec un `pending`. Permet d'émettre quand même un
   * `fileChange` quand l'id `tool_finish` ne match aucun `tool_start`
   * (cas Ollama / streams fragmentés).
   */
  private inferFileToolName(
    out: Record<string, unknown>,
  ): "file_edit" | "file_write" | "notebook_edit" | null {
    if (typeof out.cell_edits_applied === "number" && out.cell_edits_applied > 0) {
      return "notebook_edit";
    }
    if (typeof out.edits_applied === "number") return "file_edit";
    if (typeof out.bytes_written === "number") return "file_write";
    if (typeof out.diff === "string" && out.diff.length > 0) return "file_edit";
    return null;
  }

  /**
   * Émet `fileChange` quand un tool de modification a réellement écrit sur
   * disque. Le `pending` (issu de `tool_start`) sert essentiellement à
   * récupérer le `content` original passé à `file_write` — si on n'a pas
   * trouvé de pending, on reconstitue tout depuis l'output.
   *
   * Journalise dans le canal `Drox (moteur)` pour faciliter le diagnostic
   * quand un edit ne remonte pas dans le chat.
   */
  private maybePostFileChange(
    pending: { name: string; args: unknown } | undefined,
    output: unknown,
    isError: boolean,
    toolFinishId: string,
  ): void {
    if (this.replayingTranscript) {
      const ws = this.workspaceRoot();
      const scope = ws ? vscode.Uri.file(ws) : undefined;
      if (!isReplayTranscriptFileDiffsEnabled(scope)) {
        return;
      }
      if (this.replayFileChangeCount >= REPLAY_MAX_FILE_CHANGE_EVENTS) {
        if (!this.replayFileChangeLimitNotified) {
          this.replayFileChangeLimitNotified = true;
          this.post("append", {
            role: "system",
            text: `[historique] Limite de ${REPLAY_MAX_FILE_CHANGE_EVENTS} diffs fichier atteinte — suite non affichée.`,
          });
        }
        return;
      }
      this.replayFileChangeCount += 1;
    }
    if (isError) {
      this.output.appendLine(
        `[diag] file_change: skip (isError=true, id=${toolFinishId})`,
      );
      return;
    }
    const out = normalizeToolFinishOutput(output);
    if (!out) {
      if (pending) {
        this.output.appendLine(
          `[diag] file_change: skip (output not JSON for ${pending.name}, id=${toolFinishId})`,
        );
      }
      return;
    }
    let name: "file_edit" | "file_write" | "notebook_edit" | null = null;
    if (
      pending?.name === "file_edit" ||
      pending?.name === "file_write" ||
      pending?.name === "notebook_edit"
    ) {
      name = pending.name;
    } else {
      const inferred = this.inferFileToolName(out);
      if (!inferred) {
        return;
      }
      name = inferred;
      this.output.appendLine(
        `[diag] file_change: no matching pending for id=${toolFinishId}, inferred name=${name} from output`,
      );
    }
    if (!toolOutputIndicatesApplied(name, out)) {
      this.output.appendLine(
        `[diag] file_change: skip (${name} not applied, id=${toolFinishId}) keys=${Object.keys(
          out,
        ).join(",")}`,
      );
      return;
    }
    const filePath = typeof out.path === "string" ? out.path : null;
    if (!filePath) {
      this.output.appendLine(
        `[diag] file_change: skip (${name} missing path, id=${toolFinishId})`,
      );
      return;
    }

    let added = 0;
    let removed = 0;
    let diff = "";
    let content = "";

    if (name === "file_edit" || name === "notebook_edit") {
      diff = typeof out.diff === "string" ? out.diff : "";
      if (diff) {
        const counts = countDiffLines(diff);
        added = counts.added;
        removed = counts.removed;
      }
    } else {
      const args =
        pending?.args && typeof pending.args === "object"
          ? (pending.args as Record<string, unknown>)
          : null;
      content = args && typeof args.content === "string" ? args.content : "";
      if (!content && typeof out.content === "string") {
        content = out.content;
      }
      added = content.length === 0 ? 0 : content.split("\n").length;
    }

    const ws = this.workspaceRoot();
    const fpNorm = filePath.replace(/\\/g, "/");
    const wsNorm = ws ? ws.replace(/\\/g, "/") : "";
    const relPath =
      wsNorm && (fpNorm === wsNorm || fpNorm.startsWith(wsNorm + "/"))
        ? fpNorm.slice(wsNorm.length).replace(/^\/+/, "")
        : fpNorm;

    const language = languageFromPath(filePath);

    if (this.replayingTranscript) {
      diff = truncateForReplay(diff, REPLAY_MAX_DIFF_CHARS);
      content = truncateForReplay(content, REPLAY_MAX_WRITE_CONTENT_CHARS);
      if (diff) {
        const counts = countDiffLines(diff);
        added = counts.added;
        removed = counts.removed;
      }
    }

    this.output.appendLine(
      `[diag] file_change: POST op=${name} rel=${relPath} +${added}/-${removed} diff_len=${diff.length} id=${toolFinishId}`,
    );
    this.post("fileChange", {
      op: name === "file_write" ? "write" : "edit",
      path: filePath,
      relPath,
      added,
      removed,
      diff,
      content,
      language,
      replay: this.replayingTranscript,
    });

    if (
      !this.replayingTranscript &&
      shouldOpenModifiedFiles(vscode.Uri.file(filePath))
    ) {
      // Ouverture en arrière-plan : on ne bloque pas le pipeline d'events
      // si le file system est lent, et on ne vole pas le focus du chat.
      void this.openWorkspaceFile(filePath, { preserveFocus: true });
    }
  }

  /**
   * Ouvre un fichier (chemin absolu attendu) dans l'éditeur.
   *
   * - `preview: false` → onglet persistant (sinon il serait remplacé au
   *   prochain `vscode.open` et l'utilisateur perdrait l'historique).
   * - `preserveFocus` (par défaut `false`) → quand `true`, le chat garde
   *   le focus. Utilisé par l'ouverture automatique sur `fileChange` pour
   *   ne pas voler le focus à chaque édition.
   */
  private async openWorkspaceFile(
    filePath: string,
    options: { preserveFocus?: boolean } = {},
  ): Promise<void> {
    const safePath = sanitizePathForEditor(filePath);
    if (!safePath) {
      this.output.appendLine(
        `[drox] openFile ignoré (chemin invalide): ${filePath.slice(0, 120)}`,
      );
      return;
    }
    if (this.replayingTranscript) {
      return;
    }
    try {
      const uri = vscode.Uri.file(safePath);
      await vscode.window.showTextDocument(uri, {
        preview: false,
        preserveFocus: options.preserveFocus === true,
      });
    } catch (e) {
      void vscode.window.showWarningMessage(
        `Drox: impossible d'ouvrir ${filePath} (${e instanceof Error ? e.message : String(e)})`,
      );
    }
  }

  /** Demande la liste des sessions au moteur et la transmet au webview. */
  private async sendSessions(): Promise<void> {
    let client: DroxRpcClient;
    try {
      client = await this.ensureClient();
    } catch (e) {
      this.post("sessions", {
        items: [],
        error: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    try {
      const entries = await client.sessionList();
      this.post("sessions", {
        items: entries,
        currentId: this.currentSessionId ?? null,
      });
    } catch (e) {
      this.post("sessions", {
        items: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /** Charge une session existante et rejoue les messages dans le panneau. */
  private async loadSession(id: string): Promise<void> {
    const generation = ++this.sessionLoadGeneration;
    if (!id.startsWith("ses_")) {
      void vscode.window.showWarningMessage(
        `Drox: identifiant de session invalide ${id}`,
      );
      return;
    }

    const ws = this.workspaceRoot();
    const scope = ws ? vscode.Uri.file(ws) : undefined;
    if (!isReplayTranscriptOnLoadEnabled(scope)) {
      this.logUi(`loadSession: attach sans replay (${id})`);
      this.attachSessionWithoutReplay(id, [], undefined, generation);
      this.output.appendLine(
        `[drox] session ${id} ouverte sans replay (drox.replayTranscriptOnLoad=false)`,
      );
      return;
    }

    this.logUi(`loadSession: replay activé (${id})`);
    let client: DroxRpcClient;
    try {
      client = await this.ensureClient();
    } catch (e) {
      if (this.isSessionLoadCancelled(generation)) {
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      this.logUiError("loadSession ensureClient", e);
      this.post("append", {
        role: "error",
        text: `Impossible de démarrer le moteur Drox : ${msg}`,
      });
      return;
    }

    if (this.isSessionLoadCancelled(generation)) {
      return;
    }

    let messages: TranscriptMessage[] = [];
    let uiStats: SessionUiStatsSnapshot | undefined;
    try {
      const read = await client.sessionRead(id);
      messages = read.messages;
      uiStats = read.uiStats;
    } catch (e) {
      if (this.isSessionLoadCancelled(generation)) {
        return;
      }
      this.post("append", {
        role: "error",
        text: `Impossible de charger la session ${id}: ${e instanceof Error ? e.message : String(e)}`,
      });
      if (this.getPersistedSessionIdForRestore() === id) {
        this.clearPersistedSessionForRestore();
      }
      return;
    }

    if (this.isSessionLoadCancelled(generation)) {
      return;
    }

    this.currentSessionId = id;
    this.persistCurrentSessionForRestore();
    this.pendingTools.clear();
    this.replayingTranscript = true;
    this.replayFileChangeCount = 0;
    this.replayFileChangeLimitNotified = false;
    this.post("replay", {
      active: true,
      fileDiffs: isReplayTranscriptFileDiffsEnabled(scope),
    });
    this.post("chatReset", {});
    this.post("session", {
      id,
      title: transcriptPreviewTitle(messages),
      uiStats,
    });
    this.post("append", {
      role: "system",
      text: `[historique] Chargement de ${messages.length} message(s)…`,
    });

    try {
      await this.replayTranscriptMessages(messages, generation);
    } finally {
      this.replayingTranscript = false;
      if (!this.isSessionLoadCancelled(generation)) {
        this.post("replay", { active: false, fileDiffs: false });
      }
    }
  }

  /** Rejoue le transcript par paquets pour ne pas figer la webview. */
  private async replayTranscriptMessages(
    messages: TranscriptMessage[],
    generation: number,
  ): Promise<void> {
    const ws = this.workspaceRoot();
    const scope = ws ? vscode.Uri.file(ws) : undefined;
    const rich = isReplayTranscriptRichEnabled(scope);
    const fileDiffs = isReplayTranscriptFileDiffsEnabled(scope);
    const voluminous = messages.length > REPLAY_LIGHT_MESSAGE_THRESHOLD;
    if (voluminous) {
      this.post("append", {
        role: "system",
        text: `[historique] ${messages.length} messages — affichage simplifié (session volumineuse).`,
      });
    }
    if (fileDiffs && !rich && !voluminous) {
      this.post("append", {
        role: "system",
        text: "[historique] Diffs fichier rejoués (blocs outils non affichés).",
      });
    }
    for (let i = 0; i < messages.length; i++) {
      if (this.isSessionLoadCancelled(generation)) {
        return;
      }
      try {
        if (rich && !voluminous) {
          this.renderTranscriptMessage(messages[i]);
        } else if (fileDiffs) {
          this.renderTranscriptMessageWithFileDiffs(messages[i], {
            rich: rich && !voluminous,
          });
        } else {
          this.renderTranscriptMessageLight(messages[i]);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.output.appendLine(
          `[drox] replay message ${i + 1}/${messages.length} skipped: ${msg}`,
        );
      }
      if (i > 0 && (i + 1) % REPLAY_YIELD_EVERY === 0) {
        await new Promise((r) => setTimeout(r, REPLAY_YIELD_MS));
      }
    }
  }

  /**
   * Replay compact + diffs fichier (`fileChange`). Sans `rich`, les outils
   * non-fichier restent en une ligne `[outil]`.
   */
  private renderTranscriptMessageWithFileDiffs(
    m: TranscriptMessage,
    opts: { rich: boolean },
  ): void {
    const blocks = Array.isArray(m.content) ? m.content : [];
    if (m.role === "system" || m.role === "user") {
      this.renderTranscriptMessageLight(m);
      return;
    }
    if (m.role === "assistant") {
      const text = blocks
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("")
        .trim();
      if (text) {
        this.post("append", { role: "assistant", text });
      }
      for (const c of blocks) {
        if (c.type !== "tool_use") {
          continue;
        }
        const toolName = c.name != null ? String(c.name) : "?";
        if (opts.rich || isFileMutationToolName(toolName)) {
          this.replayToolStart(c.id, c.name, c.input);
        } else {
          this.post("append", {
            role: "system",
            text: `[outil] ${toolName}`,
          });
        }
      }
      return;
    }
    if (m.role === "tool") {
      for (const c of blocks) {
        if (c.type !== "tool_result") {
          continue;
        }
        const id = c.tool_use_id != null ? String(c.tool_use_id) : "?";
        const pending =
          id && id !== "?" ? this.pendingTools.get(id) : undefined;
        const pendingName = pending?.name ?? "";
        if (opts.rich || isFileMutationToolName(pendingName)) {
          this.replayToolFinish(c.tool_use_id, c.content, Boolean(c.is_error));
        } else {
          const raw = c.content ?? "";
          const head = c.is_error
            ? "[résultat outil · erreur]"
            : "[résultat outil]";
          const snippet =
            raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
          this.post("append", { role: "system", text: `${head} ${snippet}` });
          if (id && id !== "?") {
            this.pendingTools.delete(id);
          }
        }
      }
    }
  }

  /** Replay texte compact pour les longues sessions (évite le freeze DOM). */
  private renderTranscriptMessageLight(m: TranscriptMessage): void {
    const blocks = Array.isArray(m.content) ? m.content : [];
    if (m.role === "system" || m.role === "user") {
      const text = blocks
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .trim();
      if (text) {
        this.post("append", { role: m.role, text });
      }
      return;
    }
    if (m.role === "assistant") {
      const parts: string[] = [];
      for (const c of blocks) {
        if (c.type === "text") {
          parts.push(c.text);
        } else if (c.type === "tool_use") {
          parts.push(`\n[outil] ${c.name}`);
        }
      }
      const text = parts.join("").trim();
      if (text) {
        this.post("append", { role: "assistant", text });
      }
      return;
    }
    if (m.role === "tool") {
      for (const c of blocks) {
        if (c.type === "tool_result") {
          const raw = c.content ?? "";
          const head = c.is_error ? "[résultat outil · erreur]" : "[résultat outil]";
          const snippet =
            raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
          this.post("append", { role: "system", text: `${head} ${snippet}` });
        }
      }
    }
  }

  /**
   * Rejoue un message du transcript JSONL avec le même rendu que le run live
   * (blocs tool, diffs, todo_write, course_plan_write) — pas des lignes texte.
   */
  private renderTranscriptMessage(m: TranscriptMessage): void {
    const blocks = Array.isArray(m.content) ? m.content : [];
    if (m.role === "system") {
      const text = blocks
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .trim();
      if (text) {
        this.post("append", { role: "system", text });
      }
      return;
    }

    if (m.role === "user") {
      const text = blocks
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n")
        .trim();
      if (text) {
        this.post("append", { role: "user", text });
      }
      return;
    }

    if (m.role === "assistant") {
      const text = blocks
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("")
        .trim();
      if (text) {
        this.post("append", { role: "assistant", text });
      }
      for (const c of blocks) {
        if (c.type === "tool_use") {
          this.replayToolStart(c.id, c.name, c.input);
        }
      }
      return;
    }

    if (m.role === "tool") {
      for (const c of blocks) {
        if (c.type === "tool_result") {
          this.replayToolFinish(c.tool_use_id, c.content, Boolean(c.is_error));
        }
      }
    }
  }

  /** Émet `tool` start — aligné sur le pipeline `tool_start` du run live. */
  private replayToolStart(id: string, name: string, args: unknown): void {
    const toolId = id != null ? String(id) : "?";
    const toolName = name != null ? String(name) : "?";
    if (toolId && toolId !== "?") {
      this.pendingTools.set(toolId, { name: toolName, args });
    }
    if (toolName === "todo_write" || toolName === "course_plan_write") {
      return;
    }
    const { verb, target } = describeToolCall(toolName, args);
    const isFileMutation =
      toolName === "file_edit" ||
      toolName === "file_write" ||
      toolName === "notebook_edit";
    this.post("tool", {
      phase: "start",
      name: toolName,
      id: toolId,
      verb,
      target,
      argsPreview: "",
    });
  }

  /** Émet `tool` finish + fileChange / todo / course plan — aligné sur `tool_finish`. */
  private replayToolFinish(
    toolUseId: string,
    rawContent: string,
    isError: boolean,
  ): void {
    let output: unknown = rawContent ?? "";
    try {
      output = JSON.parse(rawContent) as unknown;
    } catch {
      /* chaîne brute */
    }
    const id = toolUseId || "?";
    if (this.maybePostTodoUpdate(id, output, isError)) {
      return;
    }
    if (this.maybePostCoursePlanUpdate(id, output, isError)) {
      return;
    }
    const pending = this.takePendingForFileFinish(id, output);
    this.maybePostFileChange(pending, output, isError, id);

    const pendingName = pending?.name;
    const isFileMutationFinish =
      pendingName === "file_edit" ||
      pendingName === "file_write" ||
      pendingName === "notebook_edit";
    const outputPreview = isError ? previewJson(output) : "";

    this.post("tool", {
      phase: "finish",
      id,
      isError,
      outputPreview,
    });
  }

  private async shutdownAndDispose(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.view = undefined;
    if (this.client) {
      try {
        await this.client.shutdown();
      } catch {
        /* ignore */
      }
      this.client.dispose();
      this.client = undefined;
    }
    this.initPromise = undefined;
    vscode.Disposable.from(...this.disposables).dispose();
    this.disposables.length = 0;
  }
}
