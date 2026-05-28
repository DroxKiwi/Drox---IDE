/**
 * Complétion de chemins workspace pour le composer (sprint §2.8).
 *
 * Inspiré leak `directoryCompletion.ts` + `useTypeahead` — scan léger via
 * `vscode.workspace.fs.readDirectory`, sans index global.
 */

import * as path from "node:path";
import * as vscode from "vscode";

export interface PathCompletionItem {
  /** Libellé dans la liste (ex. `src/`). */
  label: string;
  /** Texte inséré après `@` (chemin relatif au workspace). */
  insertText: string;
  kind: "file" | "directory";
  description?: string;
}

const MAX_RESULTS = 12;

/** Dossiers volumineux masqués sauf si l'utilisateur tape déjà le préfixe. */
const HEAVY_DIRS = new Set(["node_modules", ".git", "target", "dist", "build"]);

function isInsideWorkspace(workspaceRoot: string, dirPath: string): boolean {
  const ws = path.resolve(workspaceRoot);
  const dir = path.resolve(dirPath);
  return dir === ws || dir.startsWith(ws + path.sep);
}

/**
 * Découpe un token `@…` partiel en répertoire à lister + préfixe de filtre.
 */
export function parsePartialPath(
  partial: string,
  workspaceRoot: string,
): { directory: string; prefix: string } {
  let raw = partial.trim();
  if (raw.startsWith("@")) {
    raw = raw.slice(1);
  }
  if (raw.startsWith("./")) {
    raw = raw.slice(2);
  }
  if (!raw) {
    return { directory: workspaceRoot, prefix: "" };
  }
  const normalized = raw.replaceAll("\\", "/");
  if (normalized.endsWith("/")) {
    const dir = path.resolve(workspaceRoot, normalized);
    return { directory: dir, prefix: "" };
  }
  const dirPart = path.dirname(normalized);
  const base = path.basename(normalized);
  if (dirPart === "." || dirPart === "") {
    return { directory: workspaceRoot, prefix: base };
  }
  const directory = path.resolve(workspaceRoot, dirPart);
  return { directory, prefix: base };
}

/**
 * Liste fichiers et dossiers sous `workspaceRoot` pour compléter un token `@`.
 */
export async function completeWorkspacePaths(
  workspaceRoot: string,
  partial: string,
): Promise<PathCompletionItem[]> {
  const { directory, prefix } = parsePartialPath(partial, workspaceRoot);
  if (!isInsideWorkspace(workspaceRoot, directory)) {
    return [];
  }

  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(directory),
    );
  } catch {
    return [];
  }

  const prefixLower = prefix.toLowerCase();
  const items: PathCompletionItem[] = [];

  for (const [name, fileType] of entries) {
    if (name.startsWith(".") && !prefix.startsWith(".")) {
      continue;
    }
    if (HEAVY_DIRS.has(name) && !prefixLower) {
      continue;
    }
    if (prefix && !name.toLowerCase().startsWith(prefixLower)) {
      continue;
    }

    const isDir = fileType === vscode.FileType.Directory;
    const abs = path.join(directory, name);
    let rel = path.relative(workspaceRoot, abs).replaceAll("\\", "/");
    if (!rel.startsWith("./") && rel !== "..") {
      rel = rel.startsWith("..") ? rel : `./${rel}`;
    }

    items.push({
      label: isDir ? `${name}/` : name,
      insertText: isDir ? `${rel}/` : rel,
      kind: isDir ? "directory" : "file",
      description: isDir ? "dossier" : "fichier",
    });
  }

  items.sort((a, b) => {
    if (a.kind === "directory" && b.kind !== "directory") {
      return -1;
    }
    if (a.kind !== "directory" && b.kind === "directory") {
      return 1;
    }
    return a.label.localeCompare(b.label);
  });

  return items.slice(0, MAX_RESULTS);
}
