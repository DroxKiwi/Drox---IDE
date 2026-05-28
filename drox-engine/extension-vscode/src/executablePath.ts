import * as fs from "node:fs/promises";
import * as path from "node:path";

const BIN = process.platform === "win32" ? "drox.exe" : "drox";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Résout le chemin du binaire `drox` pour lancer `--serve`.
 *
 * Ordre :
 *   1. `drox.executablePath` (settings, si renseigné).
 *   2. Probes relatifs au **workspace ouvert** (le projet de l'utilisateur).
 *   3. Probes relatifs au **chemin de l'extension** (utile en mode F5 où
 *      l'extension vit dans `<repo-drox>/extension-vscode/`, indépendamment
 *      du workspace ouvert dans l'Extension Host).
 *   4. Fallback : `drox` sur le `PATH`.
 */
export async function resolveDroxExecutable(
  workspaceRoot: string,
  configured: string,
  extensionPath?: string,
): Promise<string> {
  const trimmed = configured.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }

  const candidates: string[] = [
    path.join(workspaceRoot, "drox", "target", "debug", BIN),
    path.join(workspaceRoot, "target", "debug", BIN),
    path.join(workspaceRoot, "..", "drox", "target", "debug", BIN),
  ];

  if (extensionPath) {
    candidates.push(
      path.join(extensionPath, "..", "drox", "target", "debug", BIN),
      path.join(extensionPath, "..", "..", "drox", "target", "debug", BIN),
      path.join(extensionPath, "..", "target", "debug", BIN),
    );
  }

  for (const c of candidates) {
    if (await exists(c)) {
      return c;
    }
  }
  return "drox";
}
