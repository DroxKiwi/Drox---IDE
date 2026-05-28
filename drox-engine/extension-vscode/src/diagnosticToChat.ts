import * as path from "node:path";
import * as vscode from "vscode";
import type { DroxChatViewProvider } from "./chatView";

/** Arguments sérialisables pour `drox.addDiagnosticToChat`. */
export interface DiagnosticToChatPayload {
  uri: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  message: string;
  severity: vscode.DiagnosticSeverity;
  code?: string;
}

const COMMAND = "drox.addDiagnosticToChat";

function isDiagnosticOnHoverEnabled(): boolean {
  const cfg = vscode.workspace.getConfiguration("drox");
  return cfg.get<boolean>("addDiagnosticOnHover") === true;
}

function severityLabel(sev: vscode.DiagnosticSeverity): string {
  switch (sev) {
    case vscode.DiagnosticSeverity.Error:
      return "erreur";
    case vscode.DiagnosticSeverity.Warning:
      return "avertissement";
    case vscode.DiagnosticSeverity.Information:
      return "info";
    case vscode.DiagnosticSeverity.Hint:
      return "indication";
    default:
      return "diagnostic";
  }
}

function formatDiagnosticCode(
  code: vscode.Diagnostic["code"] | undefined,
): string | undefined {
  if (code === undefined || code === null) {
    return undefined;
  }
  if (typeof code === "string" || typeof code === "number") {
    return String(code);
  }
  if (typeof code === "object" && "value" in code) {
    return String(code.value);
  }
  return undefined;
}

function payloadFromDiagnostic(
  uri: vscode.Uri,
  diagnostic: vscode.Diagnostic,
): DiagnosticToChatPayload {
  return {
    uri: uri.toString(),
    startLine: diagnostic.range.start.line,
    startCharacter: diagnostic.range.start.character,
    endLine: diagnostic.range.end.line,
    endCharacter: diagnostic.range.end.character,
    message: diagnostic.message,
    severity: diagnostic.severity,
    code: formatDiagnosticCode(diagnostic.code),
  };
}

/** Texte inséré dans le composer (sans envoi automatique). */
export function formatDiagnosticForComposer(
  uri: vscode.Uri,
  payload: DiagnosticToChatPayload,
): string {
  const ws = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
  const fp = uri.fsPath.replace(/\\/g, "/");
  const rel =
    ws && fp.startsWith(ws.replace(/\\/g, "/"))
      ? path.posix.relative(ws.replace(/\\/g, "/"), fp)
      : fp;
  const line = payload.startLine + 1;
  const col = payload.startCharacter + 1;
  const sev = severityLabel(payload.severity);
  const lines = [
    `**Diagnostic (${sev})** — \`${rel}:${line}:${col}\``,
    "",
    "```text",
    payload.message,
    "```",
  ];
  if (payload.code) {
    lines.push("", `Code : \`${payload.code}\``);
  }
  lines.push(
    "",
    "Peux-tu m’aider à corriger ce problème ?",
  );
  return lines.join("\n");
}

function diagnosticsAtPosition(
  uri: vscode.Uri,
  position: vscode.Position,
): vscode.Diagnostic[] {
  const all = vscode.languages.getDiagnostics(uri);
  return all.filter((d) => d.range.contains(position));
}

function createPassToModelAction(
  uri: vscode.Uri,
  diagnostic: vscode.Diagnostic,
): vscode.CodeAction {
  const payload = payloadFromDiagnostic(uri, diagnostic);
  const action = new vscode.CodeAction(
    "Passer au modèle",
    vscode.CodeActionKind.QuickFix,
  );
  action.diagnostics = [diagnostic];
  action.isPreferred = diagnostic.severity === vscode.DiagnosticSeverity.Error;
  action.command = {
    command: COMMAND,
    title: "Passer au modèle",
    arguments: [payload],
  };
  return action;
}

class DroxDiagnosticCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.severity === vscode.DiagnosticSeverity.Hint) {
        continue;
      }
      actions.push(createPassToModelAction(document.uri, diagnostic));
    }
    return actions;
  }
}

class DroxDiagnosticHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | undefined {
    if (!isDiagnosticOnHoverEnabled()) {
      return undefined;
    }
    const diags = diagnosticsAtPosition(document.uri, position);
    const visible = diags.filter(
      (d) => d.severity !== vscode.DiagnosticSeverity.Hint,
    );
    if (visible.length === 0) {
      return undefined;
    }

    const parts: vscode.MarkdownString[] = [];
    for (const diagnostic of visible) {
      const payload = payloadFromDiagnostic(document.uri, diagnostic);
      const encoded = encodeURIComponent(JSON.stringify(payload));
      const link = new vscode.MarkdownString(
        `[Passer au modèle](command:${COMMAND}?${encoded})`,
      );
      link.isTrusted = true;
      parts.push(link);
    }

    const header = new vscode.MarkdownString(
      visible.map((d) => d.message).join("\n\n"),
    );
    return new vscode.Hover([header, ...parts]);
  }
}

async function runAddDiagnosticToChat(
  chat: DroxChatViewProvider,
  payload: DiagnosticToChatPayload,
): Promise<void> {
  const uri = vscode.Uri.parse(payload.uri);
  const text = formatDiagnosticForComposer(uri, payload);
  await chat.prefillComposer(text);
}

/**
 * Code actions « Passer au modèle », commande et survol optionnel (§2.19).
 */
export function registerDiagnosticToChat(
  context: vscode.ExtensionContext,
  chat: DroxChatViewProvider,
): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { pattern: "**/*" },
      new DroxDiagnosticCodeActionProvider(),
      {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
      },
    ),
    vscode.languages.registerHoverProvider(
      { pattern: "**/*" },
      new DroxDiagnosticHoverProvider(),
    ),
    vscode.commands.registerCommand(
      COMMAND,
      async (payload?: DiagnosticToChatPayload) => {
        if (!payload || typeof payload.uri !== "string") {
          void vscode.window.showWarningMessage(
            "Drox : diagnostic invalide pour « Passer au modèle ».",
          );
          return;
        }
        await runAddDiagnosticToChat(chat, payload);
      },
    ),
  );
}
