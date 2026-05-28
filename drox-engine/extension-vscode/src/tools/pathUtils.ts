import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";

/**
 * Lit le réglage `drox.confirmFileWrites`. Quand `true`, les handlers
 * `file_edit` / `file_write` / `notebook_edit` ouvrent un diff dans l'éditeur et demandent une
 * confirmation modale avant d'écrire sur disque. Défaut : `false` (apply
 * direct, le diff étant déjà visible dans le chat).
 */
export function shouldConfirmFileWrites(workspaceRoot: string): boolean {
  const scope = vscode.Uri.file(workspaceRoot);
  return vscode.workspace
    .getConfiguration("drox", scope)
    .get<boolean>("confirmFileWrites", false);
}

/**
 * Aligné sur `drox_tools::path_util::resolve_path_for_write`.
 */
export async function resolvePathForWrite(
  workspaceRoot: string,
  userPath: string,
): Promise<string> {
  const trimmed = userPath.trim();
  if (!trimmed) {
    throw new Error("path must not be empty");
  }
  const joined = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.normalize(path.join(workspaceRoot, trimmed));

  const rootCanon = await fs.realpath(workspaceRoot);
  const parentUtf8 = path.dirname(joined);
  const parentCanon = await fs.realpath(parentUtf8);
  const rel = path.relative(rootCanon, parentCanon);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("path escapes workspace");
  }
  const fileName = path.basename(joined);
  if (!fileName || fileName === "." || fileName === "..") {
    throw new Error("path must include a file name");
  }
  return path.join(parentCanon, fileName);
}

/**
 * Aligné sur `drox_tools::path_util::resolve_under_workspace` : le fichier doit
 * exister (realpath sur la cible).
 */
export async function resolveExistingFileUnderWorkspace(
  workspaceRoot: string,
  userPath: string,
): Promise<string> {
  const trimmed = userPath.trim();
  if (!trimmed) {
    throw new Error("path must not be empty");
  }
  const joined = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.normalize(path.join(workspaceRoot, trimmed));

  const rootCanon = await fs.realpath(workspaceRoot);
  const targetCanon = await fs.realpath(joined);
  const rel = path.relative(rootCanon, targetCanon);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("path escapes workspace");
  }
  return targetCanon;
}

export function languageIdForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".json": "json",
    ".ipynb": "json",
    ".jsonc": "jsonc",
    ".md": "markdown",
    ".rs": "rust",
    ".toml": "toml",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".css": "css",
    ".html": "html",
    ".py": "python",
  };
  return map[ext] ?? "plaintext";
}
