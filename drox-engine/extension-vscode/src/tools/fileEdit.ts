import { createTwoFilesPatch } from "diff";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";

import type { ClientToolHandler, ToolExecParams, ToolExecResult } from "../clientTools";
import { recordCourseFileMutation } from "../courseCycleHook";
import {
  languageIdForFile,
  resolveExistingFileUnderWorkspace,
  shouldConfirmFileWrites,
} from "./pathUtils";

const MAX_FILE_SIZE = 512 * 1024;

interface EditOp {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

interface FileEditInput {
  path: string;
  edits: EditOp[];
}

/** Lit une chaîne parmi plusieurs clés ; erreur si deux clés présentes avec des valeurs différentes. */
function pickOneString(
  o: Record<string, unknown>,
  label: string,
  keys: string[],
): string | undefined {
  let chosen: string | undefined;
  for (const k of keys) {
    const v = o[k];
    if (typeof v !== "string") {
      continue;
    }
    if (chosen !== undefined && chosen !== v) {
      throw new Error(
        `file_edit: conflicting values for ${label} (${keys.join(" / ")})`,
      );
    }
    chosen = v;
  }
  return chosen;
}

function parseInput(input: unknown): FileEditInput {
  if (!input || typeof input !== "object") {
    throw new Error("file_edit: input must be an object");
  }
  const o = input as Record<string, unknown>;
  const filePath = pickOneString(o, "path", ["path", "file_path"]);
  if (typeof filePath !== "string" || !Array.isArray(o.edits)) {
    throw new Error(
      "file_edit: input requires `path` or `file_path` (string) and `edits` (array)",
    );
  }
  const edits: EditOp[] = [];
  for (const raw of o.edits) {
    if (!raw || typeof raw !== "object") {
      throw new Error("file_edit: each edit must be an object");
    }
    const e = raw as Record<string, unknown>;
    const oldStr = pickOneString(e, "old_string", [
      "old_string",
      "old",
      "oldString",
    ]);
    const newStr = pickOneString(e, "new_string", [
      "new_string",
      "new",
      "newString",
    ]);
    if (oldStr === undefined || newStr === undefined) {
      throw new Error(
        "file_edit: each edit needs `old_string` and `new_string` (aliases: old/new, oldString/newString)",
      );
    }
    edits.push({
      old_string: oldStr,
      new_string: newStr,
      replace_all: Boolean(e.replace_all),
    });
  }
  return { path: filePath, edits };
}

/** Même sémantique que `drox_tools::simple::file_edit::apply_edits`. */
export function applyEdits(original: string, edits: EditOp[]): string {
  let current = original;
  for (let idx = 0; idx < edits.length; idx++) {
    const edit = edits[idx]!;
    if (edit.old_string === edit.new_string) {
      throw new Error(`edit #${idx}: old_string == new_string`);
    }
    if (edit.old_string.length === 0) {
      throw new Error(`edit #${idx}: old_string is empty`);
    }
    if (edit.replace_all) {
      if (!current.includes(edit.old_string)) {
        throw new Error(`edit #${idx}: old_string not found`);
      }
      current = current.split(edit.old_string).join(edit.new_string);
    } else {
      const count = occurrences(current, edit.old_string);
      if (count === 0) {
        throw new Error(`edit #${idx}: old_string not found`);
      }
      if (count > 1) {
        throw new Error(
          `edit #${idx}: old_string found ${count} times (need unique or replace_all=true)`,
        );
      }
      current = current.replace(edit.old_string, edit.new_string);
    }
  }
  return current;
}

function occurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let n = 0;
  let pos = 0;
  while (true) {
    const i = haystack.indexOf(needle, pos);
    if (i < 0) {
      break;
    }
    n += 1;
    pos = i + needle.length;
  }
  return n;
}

function unifiedDiff(label: string, before: string, after: string): string {
  return createTwoFilesPatch(label, label, before, after, label, label, {
    context: 3,
  });
}

export function createFileEditHandler(): ClientToolHandler {
  return async (p: ToolExecParams): Promise<ToolExecResult> => {
    const args = parseInput(p.input);
    if (args.edits.length === 0) {
      return {
        output: { error: "edits must not be empty" },
        isError: true,
      };
    }

    let absPath: string;
    try {
      absPath = await resolveExistingFileUnderWorkspace(p.workspace, args.path);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        output: { error: msg },
        isError: true,
      };
    }

    const pathForModel = absPath.replace(/\\/g, "/");

    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(absPath);
    } catch (e) {
      return {
        output: {
          error: `stat failed: ${e instanceof Error ? e.message : String(e)}`,
        },
        isError: true,
      };
    }
    if (!stat.isFile()) {
      return {
        output: { error: `not a regular file: ${pathForModel}` },
        isError: true,
      };
    }
    if (stat.size > MAX_FILE_SIZE) {
      return {
        output: {
          error: `file too large (${stat.size} bytes > ${MAX_FILE_SIZE} bytes limit)`,
        },
        isError: true,
      };
    }

    let bytes: Buffer;
    try {
      bytes = await fs.readFile(absPath);
    } catch (e) {
      return {
        output: {
          error: `read failed: ${e instanceof Error ? e.message : String(e)}`,
        },
        isError: true,
      };
    }
    const original = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

    let updated: string;
    try {
      updated = applyEdits(original, args.edits);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        output: { error: msg },
        isError: true,
      };
    }

    if (updated === original) {
      return {
        output: { error: "edits produced no change" },
        isError: true,
      };
    }

    const diff = unifiedDiff(pathForModel, original, updated);

    if (p.planMode) {
      return {
        output: {
          error: "plan mode forbids write operation: file_edit",
        },
        isError: true,
      };
    }

    if (!p.applyFsWrites) {
      return {
        output: {
          applied: false,
          proposed: true,
          path: pathForModel,
          new_content: updated,
          diff,
        },
      };
    }

    if (shouldConfirmFileWrites(p.workspace)) {
      const lang = languageIdForFile(absPath);
      const leftDoc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(absPath),
      );
      const rightDoc = await vscode.workspace.openTextDocument({
        content: updated,
        language: lang,
      });

      const rel = path.relative(p.workspace, absPath);
      const title = `Drox — file_edit (${rel || path.basename(absPath)})`;
      await vscode.commands.executeCommand(
        "vscode.diff",
        leftDoc.uri,
        rightDoc.uri,
        title,
        { preview: true },
      );

      const choice = await vscode.window.showInformationMessage(
        "Appliquer les modifications sur disque ?",
        { modal: true },
        "Appliquer",
        "Abandonner",
      );

      if (choice !== "Appliquer") {
        return {
          output: {
            applied: false,
            cancelled: true,
            path: pathForModel,
            diff,
          },
        };
      }
    }

    const uri = vscode.Uri.file(absPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const lastLine = doc.lineCount - 1;
    const endChar = doc.lineAt(lastLine).range.end.character;
    const entire = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(lastLine, endChar));
    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.replace(uri, entire, updated);
    const appliedEdit = await vscode.workspace.applyEdit(wsEdit);
    if (!appliedEdit) {
      return {
        output: { error: "workspace applyEdit was rejected" },
        isError: true,
      };
    }

    // `file_read` côté moteur lit le disque : sans `save()`, le tampon VS Code peut
    // différer du fichier sur disque et le modèle croit que l'édition a « échoué ».
    const saved = await doc.save();
    if (!saved) {
      return {
        output: {
          error:
            "file_edit: la modification a été appliquée dans l’éditeur mais la sauvegarde sur disque a échoué ; enregistrez le fichier manuellement puis réessayez.",
          path: pathForModel,
          edits_applied: args.edits.length,
          diff,
        },
        isError: true,
      };
    }

    await recordCourseFileMutation(p.workspace, "file_edit", absPath, "modify");

    return {
      output: {
        applied: true,
        path: pathForModel,
        edits_applied: args.edits.length,
        diff,
      },
    };
  };
}
