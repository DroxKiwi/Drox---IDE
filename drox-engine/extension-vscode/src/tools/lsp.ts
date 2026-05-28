import * as path from "node:path";
import * as vscode from "vscode";

import type {
  ClientToolHandler,
  ToolExecParams,
  ToolExecResult,
} from "../clientTools";

type LspOp =
  | "diagnostics"
  | "workspace_symbol"
  | "definition"
  | "references"
  | "hover";

interface LspPosition {
  line: number;
  character: number;
}

interface LspInput {
  op: LspOp;
  path?: string;
  position?: LspPosition;
  symbol?: string;
  query?: string;
  max_results?: number;
}

const ALLOWED_OPS: readonly LspOp[] = [
  "diagnostics",
  "workspace_symbol",
  "definition",
  "references",
  "hover",
];

const DEFAULT_MAX_RESULTS = 50;
const ABS_MAX_RESULTS = 500;
const HOVER_MAX_CHARS = 4000;

interface SerializedRange {
  start: LspPosition;
  end: LspPosition;
}

interface SerializedLocation {
  path: string;
  range: SerializedRange;
}

interface SerializedDiagnostic extends SerializedLocation {
  severity: string;
  message: string;
  source?: string;
  code?: string;
}

interface SerializedSymbol {
  name: string;
  kind: string;
  container?: string;
  location: SerializedLocation;
}

function parseInput(input: unknown): LspInput {
  if (!input || typeof input !== "object") {
    throw new Error("lsp: input must be an object");
  }
  const o = input as Record<string, unknown>;
  if (typeof o.op !== "string") {
    throw new Error("lsp: input requires a string `op`");
  }
  if (!ALLOWED_OPS.includes(o.op as LspOp)) {
    throw new Error(
      `lsp: unknown op \`${o.op}\` (allowed: ${ALLOWED_OPS.join(", ")})`,
    );
  }
  const out: LspInput = { op: o.op as LspOp };
  if (typeof o.path === "string") out.path = o.path;
  if (typeof o.symbol === "string") out.symbol = o.symbol;
  if (typeof o.query === "string") out.query = o.query;
  if (typeof o.max_results === "number" && Number.isFinite(o.max_results)) {
    out.max_results = o.max_results;
  }
  if (o.position && typeof o.position === "object") {
    const p = o.position as Record<string, unknown>;
    if (typeof p.line === "number" && typeof p.character === "number") {
      out.position = { line: p.line, character: p.character };
    }
  }
  return out;
}

function clampResults(n: number | undefined): number {
  const raw =
    typeof n === "number" && Number.isFinite(n) ? n : DEFAULT_MAX_RESULTS;
  return Math.max(1, Math.min(ABS_MAX_RESULTS, Math.floor(raw)));
}

function relPath(workspace: string, uri: vscode.Uri): string {
  try {
    const r = path.relative(workspace, uri.fsPath);
    if (r && !r.startsWith("..") && !path.isAbsolute(r)) {
      return r.replace(/\\/g, "/");
    }
  } catch {
    /* fallthrough */
  }
  return uri.fsPath.replace(/\\/g, "/");
}

function serializeRange(range: vscode.Range): SerializedRange {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}

function severityName(sev: vscode.DiagnosticSeverity): string {
  switch (sev) {
    case vscode.DiagnosticSeverity.Error:
      return "error";
    case vscode.DiagnosticSeverity.Warning:
      return "warning";
    case vscode.DiagnosticSeverity.Information:
      return "info";
    case vscode.DiagnosticSeverity.Hint:
      return "hint";
    default:
      return "unknown";
  }
}

/**
 * Mapping numérique `vscode.SymbolKind` → libellé textuel (l'enum côté VS Code
 * est une const enum numérique : on l'aplatit pour la sérialisation JSON et
 * pour rester intelligible côté modèle).
 */
const SYMBOL_KIND_NAMES: Record<number, string> = {
  0: "file",
  1: "module",
  2: "namespace",
  3: "package",
  4: "class",
  5: "method",
  6: "property",
  7: "field",
  8: "constructor",
  9: "enum",
  10: "interface",
  11: "function",
  12: "variable",
  13: "constant",
  14: "string",
  15: "number",
  16: "boolean",
  17: "array",
  18: "object",
  19: "key",
  20: "null",
  21: "enum_member",
  22: "struct",
  23: "event",
  24: "operator",
  25: "type_parameter",
};

function symbolKindName(k: vscode.SymbolKind): string {
  return SYMBOL_KIND_NAMES[k] ?? `kind_${k}`;
}

function codeToString(
  code: vscode.Diagnostic["code"] | undefined,
): string | undefined {
  if (code === undefined || code === null) return undefined;
  if (typeof code === "string" || typeof code === "number") return String(code);
  if (typeof code === "object" && "value" in code) {
    return String((code as { value: string | number }).value);
  }
  return undefined;
}

function hoverContentText(h: vscode.Hover): string {
  const parts: string[] = [];
  for (const c of h.contents) {
    if (typeof c === "string") {
      parts.push(c);
    } else if (c instanceof vscode.MarkdownString) {
      parts.push(c.value);
    } else if (c && typeof c === "object" && "value" in c) {
      const value = (c as { value: unknown }).value;
      if (typeof value === "string") parts.push(value);
    }
  }
  return parts.join("\n\n");
}

function resolveFileUri(workspace: string, userPath: string): vscode.Uri {
  const abs = path.isAbsolute(userPath)
    ? userPath
    : path.join(workspace, userPath);
  return vscode.Uri.file(path.normalize(abs));
}

async function resolveSymbolPosition(
  uri: vscode.Uri,
  symbol: string,
): Promise<vscode.Position> {
  const trimmed = symbol.trim();
  if (!trimmed) {
    throw new Error("lsp: `symbol` must not be empty");
  }
  const doc = await vscode.workspace.openTextDocument(uri);
  const text = doc.getText();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)
    ? new RegExp(`\\b${escaped}\\b`)
    : new RegExp(escaped);
  const m = rx.exec(text);
  if (!m) {
    throw new Error(
      `lsp: symbol \`${trimmed}\` not found in ${path.basename(uri.fsPath)}`,
    );
  }
  return doc.positionAt(m.index);
}

async function resolvePosition(
  workspace: string,
  input: LspInput,
): Promise<{ uri: vscode.Uri; pos: vscode.Position }> {
  if (!input.path) {
    throw new Error("lsp: this op requires `path`");
  }
  const uri = resolveFileUri(workspace, input.path);
  if (input.position) {
    return {
      uri,
      pos: new vscode.Position(input.position.line, input.position.character),
    };
  }
  if (input.symbol) {
    const pos = await resolveSymbolPosition(uri, input.symbol);
    return { uri, pos };
  }
  throw new Error("lsp: this op requires either `position` or `symbol`");
}

/**
 * Les providers `executeDefinitionProvider` / `executeReferenceProvider`
 * peuvent renvoyer indifféremment des `Location` (vieille forme, `.uri` +
 * `.range`) ou des `LocationLink` (nouvelle forme, `.targetUri` +
 * `.targetRange` — utile pour le navigateur d'aperçu). On harmonise.
 */
function normalizeLocations(
  raw: ReadonlyArray<vscode.Location | vscode.LocationLink>,
): Array<{ uri: vscode.Uri; range: vscode.Range }> {
  return raw.map((l) => {
    if ("targetUri" in l) {
      return { uri: l.targetUri, range: l.targetRange };
    }
    return { uri: l.uri, range: l.range };
  });
}

async function execDiagnostics(
  workspace: string,
  input: LspInput,
): Promise<ToolExecResult> {
  const max = clampResults(input.max_results);
  const results: SerializedDiagnostic[] = [];
  let total = 0;
  if (input.path) {
    const uri = resolveFileUri(workspace, input.path);
    const diags = vscode.languages.getDiagnostics(uri);
    total = diags.length;
    for (const d of diags) {
      if (results.length >= max) break;
      results.push({
        path: relPath(workspace, uri),
        severity: severityName(d.severity),
        message: d.message,
        range: serializeRange(d.range),
        source: d.source,
        code: codeToString(d.code),
      });
    }
  } else {
    const entries = vscode.languages.getDiagnostics();
    for (const [uri, diags] of entries) {
      total += diags.length;
      for (const d of diags) {
        if (results.length >= max) continue;
        results.push({
          path: relPath(workspace, uri),
          severity: severityName(d.severity),
          message: d.message,
          range: serializeRange(d.range),
          source: d.source,
          code: codeToString(d.code),
        });
      }
    }
  }
  return {
    output: {
      op: "diagnostics",
      scope: input.path ?? "(workspace)",
      total,
      result_count: results.length,
      truncated: total > results.length,
      results,
      hint:
        results.length === 0 && total === 0
          ? "Aucun diagnostic. Le language server n'est peut-être pas encore prêt — patiente quelques secondes après une modification (rust-analyzer met du temps à indexer)."
          : undefined,
    },
  };
}

async function execWorkspaceSymbol(input: LspInput): Promise<ToolExecResult> {
  const query = (input.query ?? input.symbol ?? "").trim();
  if (!query) {
    throw new Error("lsp: `workspace_symbol` requires `query` (or `symbol`)");
  }
  const max = clampResults(input.max_results);
  const raw =
    (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      "vscode.executeWorkspaceSymbolProvider",
      query,
    )) ?? [];
  const ws =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const results: SerializedSymbol[] = raw.slice(0, max).map((s) => ({
    name: s.name,
    kind: symbolKindName(s.kind),
    container: s.containerName || undefined,
    location: {
      path: relPath(ws, s.location.uri),
      range: serializeRange(s.location.range),
    },
  }));
  return {
    output: {
      op: "workspace_symbol",
      query,
      total: raw.length,
      result_count: results.length,
      truncated: raw.length > results.length,
      results,
    },
  };
}

async function execLocations(
  workspace: string,
  input: LspInput,
  op: "definition" | "references",
): Promise<ToolExecResult> {
  const { uri, pos } = await resolvePosition(workspace, input);
  const command =
    op === "definition"
      ? "vscode.executeDefinitionProvider"
      : "vscode.executeReferenceProvider";
  const raw =
    (await vscode.commands.executeCommand<
      Array<vscode.Location | vscode.LocationLink>
    >(command, uri, pos)) ?? [];
  const normalized = normalizeLocations(raw);
  const max = clampResults(input.max_results);
  const results: SerializedLocation[] = normalized.slice(0, max).map((l) => ({
    path: relPath(workspace, l.uri),
    range: serializeRange(l.range),
  }));
  return {
    output: {
      op,
      origin: {
        path: relPath(workspace, uri),
        position: { line: pos.line, character: pos.character },
      },
      total: normalized.length,
      result_count: results.length,
      truncated: normalized.length > results.length,
      results,
    },
  };
}

async function execHover(
  workspace: string,
  input: LspInput,
): Promise<ToolExecResult> {
  const { uri, pos } = await resolvePosition(workspace, input);
  const raw =
    (await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      uri,
      pos,
    )) ?? [];
  let text = raw.map(hoverContentText).filter(Boolean).join("\n\n").trim();
  const truncated = text.length > HOVER_MAX_CHARS;
  if (truncated) text = `${text.slice(0, HOVER_MAX_CHARS)}\n…[truncated]`;
  return {
    output: {
      op: "hover",
      origin: {
        path: relPath(workspace, uri),
        position: { line: pos.line, character: pos.character },
      },
      hover_count: raw.length,
      content: text,
      truncated,
    },
  };
}

/**
 * Handler `lsp` côté VS Code : dispatche vers les commandes
 * `vscode.execute*Provider` selon `op`. Aucune écriture filesystem : ce tool
 * est marqué read-only côté permissions et auto-allow en mode `default`.
 *
 * Diagnostics, positions et ranges sont en **0-indexé** (convention LSP).
 */
export function createLspHandler(): ClientToolHandler {
  return async (p: ToolExecParams): Promise<ToolExecResult> => {
    const input = parseInput(p.input);
    switch (input.op) {
      case "diagnostics":
        return execDiagnostics(p.workspace, input);
      case "workspace_symbol":
        return execWorkspaceSymbol(input);
      case "definition":
        return execLocations(p.workspace, input, "definition");
      case "references":
        return execLocations(p.workspace, input, "references");
      case "hover":
        return execHover(p.workspace, input);
      default: {
        const exhaustive: never = input.op;
        throw new Error(`lsp: unhandled op ${String(exhaustive)}`);
      }
    }
  };
}
