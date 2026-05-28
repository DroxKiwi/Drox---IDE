import * as vscode from "vscode";

/** Nœud unique : la vue sert uniquement de zone de dépôt (API hôte VS Code). */
export type RefsDropItem = { readonly id: "drox-refs-drop-zone" };

const ZONE: RefsDropItem = { id: "drox-refs-drop-zone" };

/**
 * Zone de dépôt **native** (TreeView + TreeDragAndDropController) : VS Code y
 * injecte correctement `text/uri-list` / `files` quand on glisse depuis
 * l’Explorateur — ce que la webview du chat ne peut pas recevoir de façon fiable.
 */
export class DroxRefsDropView
  implements
    vscode.TreeDataProvider<RefsDropItem>,
    vscode.TreeDragAndDropController<RefsDropItem>,
    vscode.Disposable
{
  readonly dropMimeTypes: readonly string[] = [
    "text/uri-list",
    "application/vnd.code.uri-list",
    "files",
    "text/plain",
  ];

  /** Aucun drag interne ; obligatoire pour l’interface. */
  readonly dragMimeTypes: readonly string[] = [];

  private readonly treeView: vscode.TreeView<RefsDropItem>;

  constructor(
    viewId: string,
    private readonly onDroppedFileUris: (uris: string[]) => void,
  ) {
    this.treeView = vscode.window.createTreeView(viewId, {
      treeDataProvider: this,
      dragAndDropController: this,
      showCollapseAll: false,
    });
  }

  dispose(): void {
    this.treeView.dispose();
  }

  getTreeView(): vscode.TreeView<RefsDropItem> {
    return this.treeView;
  }

  getTreeItem(element: RefsDropItem): vscode.TreeItem {
    return {
      id: element.id,
      label: "Glisser fichiers / dossiers (Explorateur)",
      description: "→ références du chat",
      tooltip:
        "Déposez ici des fichiers ou dossiers depuis l’Explorateur de fichiers VS Code. " +
        "Les chemins sont ajoutés comme références dans le composer Drox (chips au-dessus du message).",
      collapsibleState: vscode.TreeItemCollapsibleState.None,
      iconPath: new vscode.ThemeIcon("folder-opened"),
    };
  }

  getChildren(
    element?: RefsDropItem,
  ): vscode.ProviderResult<RefsDropItem[]> {
    if (!element) {
      return [ZONE];
    }
    return [];
  }

  getParent(): vscode.ProviderResult<RefsDropItem> {
    return undefined;
  }

  async handleDrop(
    _target: RefsDropItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken,
  ): Promise<void> {
    /** Forme canonique → URI string, pour éviter les doublons d’encodage. */
    const canonical = new Map<string, string>();

    const addCandidate = (raw: string): void => {
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith("#")) return;

      let uri: vscode.Uri | undefined;
      try {
        if (trimmed.includes("://")) {
          uri = vscode.Uri.parse(trimmed, true);
        } else if (/^[a-zA-Z]:[\\/]/.test(trimmed) || trimmed.startsWith("/")) {
          uri = vscode.Uri.file(trimmed);
        }
      } catch {
        return;
      }
      if (!uri) return;

      const key = uri.toString().toLowerCase();
      if (!canonical.has(key)) {
        canonical.set(key, uri.toString());
      }
    };

    const collectFromMime = async (mime: string): Promise<boolean> => {
      const it = dataTransfer.get(mime);
      if (!it) return false;
      let raw = "";
      try {
        raw = await it.asString();
      } catch {
        return false;
      }
      if (!raw) return false;
      for (const line of raw.split(/\r?\n/)) {
        addCandidate(line);
      }
      return true;
    };

    const gotUriList =
      (await collectFromMime("text/uri-list")) ||
      (await collectFromMime("application/vnd.code.uri-list"));

    if (token.isCancellationRequested) {
      return;
    }

    // On n’explore les `DataTransferFile` QUE si aucune liste d’URIs n’a été
    // fournie : sinon VS Code expose les mêmes fichiers via les deux canaux et
    // on obtient des doublons.
    if (!gotUriList) {
      for (const [, item] of dataTransfer) {
        if (token.isCancellationRequested) {
          return;
        }
        const file = item.asFile();
        if (file?.uri) {
          addCandidate(file.uri.toString());
        }
      }
      // Repli `text/plain` (drag depuis un éditeur, etc.).
      if (canonical.size === 0) {
        await collectFromMime("text/plain");
      }
    }

    const dedup = Array.from(canonical.values());
    if (dedup.length > 0) {
      this.onDroppedFileUris(dedup);
    }
  }
}
