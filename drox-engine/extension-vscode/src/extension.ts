import * as vscode from "vscode";
import { DROX_CHAT_VIEW_ID, DroxChatViewProvider } from "./chatView";
import { registerDiagnosticToChat } from "./diagnosticToChat";
import { PasteCandidateTracker } from "./pasteCandidates";
import { DroxRefsDropView } from "./refsDropTreeView";
import {
  createUiOutputChannel,
  DROX_UI_OUTPUT,
  uiLogLine,
} from "./uiLog";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Drox (moteur)");
  context.subscriptions.push(output);
  output.appendLine(
    `[drox] extension activée — ${new Date().toISOString()} (build drag-drop v2)`,
  );

  const uiOutput = createUiOutputChannel();
  context.subscriptions.push(uiOutput);
  uiLogLine(uiOutput, "extension activate()");
  uiOutput.show(true);

  const pasteTracker = new PasteCandidateTracker();
  context.subscriptions.push(pasteTracker);

  const provider = new DroxChatViewProvider(
    context.extensionUri,
    output,
    uiOutput,
    pasteTracker,
    context,
  );
  const refsDrop = new DroxRefsDropView("drox.refsDrop", (uris) => {
    provider.postRefsToWebview(uris);
  });
  context.subscriptions.push(refsDrop);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DROX_CHAT_VIEW_ID, provider, {
      // false : évite une webview « zombie » (UI visible mais messages morts).
      webviewOptions: { retainContextWhenHidden: false },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("drox.openChat", async () => {
      await DroxChatViewProvider.reveal();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("drox.addContextReferences", async () => {
      await provider.pickContextReferences();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("drox.openSettings", async () => {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:drox.drox-vscode",
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("drox.showUiLog", () => {
      uiOutput.show(true);
    }),
  );

  registerDiagnosticToChat(context, provider);
}

export { DROX_UI_OUTPUT };

export function deactivate(): void {}
