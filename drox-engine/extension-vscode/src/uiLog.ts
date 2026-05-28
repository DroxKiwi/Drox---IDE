import * as vscode from "vscode";

/** Canal dédié au diagnostic webview ↔ extension (distinct du moteur Rust). */
export const DROX_UI_OUTPUT = "Drox (UI)";

export function createUiOutputChannel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel(DROX_UI_OUTPUT, { log: true });
}

export function uiLogLine(
  channel: vscode.OutputChannel,
  message: string,
): void {
  const ts = new Date().toISOString().slice(11, 23);
  channel.appendLine(`[${ts}] ${message}`);
}

export function uiLogError(
  channel: vscode.OutputChannel,
  context: string,
  err: unknown,
): void {
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error && err.stack ? `\n  ${err.stack}` : "";
  uiLogLine(channel, `${context} ERREUR: ${msg}${stack}`);
}
