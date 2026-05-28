import * as path from "node:path";
import * as vscode from "vscode";

/**
 * Valeur de `absPath` pour une sélection **terminal** (pas un fichier disque).
 * Permet à `formatPastesForPrompt` / `openPasteSource` de router sans ambiguïté.
 */
export const TERMINAL_SMART_PASTE_ABS_SENTINEL = "__drox_terminal_selection__";

/**
 * Information sur une sélection récente (éditeur ou terminal), candidate à un
 * **smart paste** dans le composer du chat Drox.
 *
 * Le `token` est un hash 32-bit FNV-1a du texte sélectionné **normalisé**
 * (CRLF → LF, sans BOM, sans espaces de fin de ligne). Le matching côté
 * webview se fait sur ce token : il évite d'envoyer le texte complet du
 * presse-papier à l'extension à chaque paste (sécurité + latence), tout en
 * restant déterministe entre les deux côtés.
 */
export interface PasteCandidate {
  /** Identifiant unique (UUID-like) côté webview. */
  readonly id: string;
  /** `editor` = fichier ; `terminal` = sortie / sélection terminal intégré. */
  readonly kind: "editor" | "terminal";
  /** Hash 32-bit (hex) FNV-1a du texte normalisé. Clé de matching webview. */
  readonly token: string;
  /**
   * Chemin absolu du fichier (`editor`) ou {@link TERMINAL_SMART_PASTE_ABS_SENTINEL}
   * pour le terminal.
   */
  readonly absPath: string;
  /**
   * Fichier : chemin relatif au workspace si applicable.
   * Terminal : **nom du terminal** (libellé VS Code) pour l’UI / révélation.
   */
  readonly relPath: string | null;
  /** Identifiant de langage VS Code (`typescript`, `rust`, …) ou `shellsession`. */
  readonly languageId: string;
  /** Ligne de début (1-indexée, inclusive). Terminal : toujours 1 (pas d’API de plage buffer). */
  readonly startLine: number;
  /** Ligne de fin (1-indexée, inclusive). */
  readonly endLine: number;
  /** Nombre total de lignes capturées (≥ 1). */
  readonly lineCount: number;
  /** Texte complet sélectionné (tel quel, sans normalisation). */
  readonly text: string;
}

/** Forme allégée envoyée à la webview (le texte est réinjecté au `send`). */
export interface PasteCandidateWire {
  readonly id: string;
  readonly token: string;
  readonly kind: "editor" | "terminal";
  readonly relPath: string | null;
  readonly absPath: string;
  readonly languageId: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly lineCount: number;
  /** Texte transmis tel quel pour que la webview puisse l'attacher au send. */
  readonly text: string;
}

const MAX_CANDIDATES = 10;
const MAX_TEXT_LENGTH = 200_000;

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
}

/** Hash 32-bit FNV-1a, retourné en hex (8 caractères). */
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function generateId(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

function toRelPath(absFsPath: string, workspaceRoot: string | null): string | null {
  if (!workspaceRoot) return null;
  const ws = workspaceRoot.replace(/\\/g, "/");
  const p = absFsPath.replace(/\\/g, "/");
  if (p === ws || p.startsWith(ws + "/")) {
    const inside = p.slice(ws.length).replace(/^\/+/, "");
    return inside;
  }
  return null;
}

/** API `onDidChangeTerminalSelection` / `terminal.selection` : stable dans VS Code récent, parfois absente des @types. */
type VscodeWindowWithTerminalSelection = typeof vscode.window & {
  onDidChangeTerminalSelection?: vscode.Event<vscode.Terminal>;
};

type TerminalWithOptionalSelection = vscode.Terminal & { selection?: string };

function registerTerminalSelectionIfAvailable(
  subscriptions: vscode.Disposable[],
  handler: (terminal: vscode.Terminal) => void,
): void {
  const win = vscode.window as VscodeWindowWithTerminalSelection;
  if (typeof win.onDidChangeTerminalSelection === "function") {
    subscriptions.push(win.onDidChangeTerminalSelection((t) => handler(t)));
  }
}

/**
 * Tracker de sélections récentes (éditeur + terminal si l’API est dispo) :
 * à chaque modification de sélection **non vide**, on capture une `PasteCandidate`
 * et on l'expose via `onDidUpdate` (l'extension la pousse alors à la webview).
 *
 * Cap LRU à 10 entrées (cf. §2.9 du backlog). Texte > 200 000 caractères → ignoré.
 */
export class PasteCandidateTracker implements vscode.Disposable {
  private readonly candidates = new Map<string, PasteCandidate>();
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly emitter = new vscode.EventEmitter<PasteCandidateWire>();
  readonly onDidUpdate = this.emitter.event;

  constructor() {
    this.subscriptions.push(
      vscode.window.onDidChangeTextEditorSelection((e) =>
        this.handleEditorSelectionChange(e),
      ),
    );
    registerTerminalSelectionIfAvailable(this.subscriptions, (t) =>
      this.handleTerminalSelectionChange(t),
    );
  }

  dispose(): void {
    for (const d of this.subscriptions) {
      d.dispose();
    }
    this.emitter.dispose();
    this.candidates.clear();
  }

  /** Récupère un candidat par son `token` (FNV-1a hex). */
  getByToken(token: string): PasteCandidate | undefined {
    for (const c of this.candidates.values()) {
      if (c.token === token) {
        return c;
      }
    }
    return undefined;
  }

  /** Réémet tous les candidats actuels (utile à l'attachement webview). */
  resync(): void {
    for (const c of this.candidates.values()) {
      this.emitter.fire(toWire(c));
    }
  }

  private pushCandidate(candidate: PasteCandidate): void {
    const token = candidate.token;
    if (this.candidates.has(token)) {
      const existing = this.candidates.get(token)!;
      this.candidates.delete(token);
      this.candidates.set(token, existing);
      return;
    }

    this.candidates.set(token, candidate);
    while (this.candidates.size > MAX_CANDIDATES) {
      const oldest = this.candidates.keys().next().value;
      if (oldest === undefined) break;
      this.candidates.delete(oldest);
    }

    this.emitter.fire(toWire(candidate));
  }

  private handleEditorSelectionChange(
    e: vscode.TextEditorSelectionChangeEvent,
  ): void {
    const editor = e.textEditor;
    const doc = editor.document;
    if (doc.uri.scheme !== "file") {
      return;
    }
    const sel = editor.selection;
    if (sel.isEmpty) {
      return;
    }
    const text = doc.getText(sel);
    if (!text || text.length > MAX_TEXT_LENGTH) {
      return;
    }
    const normalized = normalize(text);
    if (normalized.trim().length === 0) {
      return;
    }
    const token = fnv1a32(normalized);
    if (this.candidates.has(token)) {
      const existing = this.candidates.get(token)!;
      this.candidates.delete(token);
      this.candidates.set(token, existing);
      return;
    }

    const startLine = sel.start.line + 1;
    const endLine = sel.end.line + 1;
    const absPath = doc.uri.fsPath;
    const wsFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    const wsRoot = wsFolder ? wsFolder.uri.fsPath : null;
    const candidate: PasteCandidate = {
      id: generateId(),
      kind: "editor",
      token,
      absPath,
      relPath: toRelPath(absPath, wsRoot),
      languageId: doc.languageId || "plaintext",
      startLine,
      endLine,
      lineCount: endLine - startLine + 1,
      text,
    };

    this.pushCandidate(candidate);
  }

  private handleTerminalSelectionChange(terminal: vscode.Terminal): void {
    const rawSel = (terminal as TerminalWithOptionalSelection).selection;
    const text = typeof rawSel === "string" ? rawSel : "";
    if (!text || text.length > MAX_TEXT_LENGTH) {
      return;
    }
    const normalized = normalize(text);
    if (normalized.trim().length === 0) {
      return;
    }
    const token = fnv1a32(normalized);
    if (this.candidates.has(token)) {
      const existing = this.candidates.get(token)!;
      this.candidates.delete(token);
      this.candidates.set(token, existing);
      return;
    }

    const lines = text.split(/\r?\n/);
    const lineCount = Math.max(1, lines.length);
    const candidate: PasteCandidate = {
      id: generateId(),
      kind: "terminal",
      token,
      absPath: TERMINAL_SMART_PASTE_ABS_SENTINEL,
      relPath: terminal.name,
      languageId: "shellsession",
      startLine: 1,
      endLine: lineCount,
      lineCount,
      text,
    };

    this.pushCandidate(candidate);
  }
}

function toWire(c: PasteCandidate): PasteCandidateWire {
  return {
    id: c.id,
    token: c.token,
    kind: c.kind,
    relPath: c.relPath,
    absPath: c.absPath,
    languageId: c.languageId,
    startLine: c.startLine,
    endLine: c.endLine,
    lineCount: c.lineCount,
    text: c.text,
  };
}

/** Récupère le `path.basename` POSIX d'un chemin absolu ou relatif. */
export function basenamePosix(p: string): string {
  return path.basename(p.replace(/\\/g, "/"));
}
