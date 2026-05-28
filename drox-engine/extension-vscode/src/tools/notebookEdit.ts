import { createTwoFilesPatch } from "diff";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";

import type { ClientToolHandler, ToolExecParams, ToolExecResult } from "../clientTools";
import { recordCourseFileMutation } from "../courseCycleHook";
import { applyEdits } from "./fileEdit";
import {
  languageIdForFile,
  resolveExistingFileUnderWorkspace,
  shouldConfirmFileWrites,
} from "./pathUtils";

const MAX_FILE_SIZE = 512 * 1024;

type CellEditMode = "replace" | "insert" | "delete";

interface CellEditOp {
  cell_index: number;
  edit_mode?: CellEditMode;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
  cell_type?: string;
}

interface NotebookEditInput {
  path: string;
  edits: CellEditOp[];
}

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
        `notebook_edit: conflicting values for ${label} (${keys.join(" / ")})`,
      );
    }
    chosen = v;
  }
  return chosen;
}

function pickUsize(o: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) {
      return v;
    }
    if (typeof v === "string" && /^\d+$/.test(v)) {
      return Number.parseInt(v, 10);
    }
  }
  return undefined;
}

function parseEditMode(raw: unknown): CellEditMode {
  if (typeof raw !== "string") {
    return "replace";
  }
  const m = raw.toLowerCase();
  if (m === "insert") return "insert";
  if (m === "delete") return "delete";
  return "replace";
}

/** Aligné sur `drox-tools::notebook_edit::normalize_input`. */
function normalizeNotebookInput(input: unknown): NotebookEditInput {
  if (!input || typeof input !== "object") {
    throw new Error("notebook_edit: input must be an object");
  }
  const o = input as Record<string, unknown>;

  try {
    return parseInput(input);
  } catch {
    // fall through
  }

  const pathStr = pickOneString(o, "path", ["path", "file_path", "notebook_path"]);
  if (!pathStr) {
    throw new Error("notebook_edit: missing path (or notebook_path)");
  }

  if ("new_source" in o) {
    const newSource =
      pickOneString(o, "new_source", ["new_source", "new_string", "new"]) ?? "";
    const cellIndex = pickUsize(o, ["cell_index", "cell_number", "cellIndex"]) ?? 0;
    const editMode = parseEditMode(o.edit_mode);
    const cellType = pickOneString(o, "cell_type", ["cell_type"]);
    return {
      path: pathStr,
      edits: [
        {
          cell_index: cellIndex,
          edit_mode: editMode,
          old_string: "",
          new_string: newSource,
          cell_type: cellType,
        },
      ],
    };
  }

  if ("cell_index" in o || "cell_number" in o) {
    const cellIndex = pickUsize(o, ["cell_index", "cell_number", "cellIndex"]) ?? 0;
    const editMode = parseEditMode(o.edit_mode);
    const oldStr =
      pickOneString(o, "old_string", ["old_string", "old", "oldString"]) ?? "";
    const newStr =
      pickOneString(o, "new_string", [
        "new_string",
        "new",
        "newString",
        "new_source",
      ]) ?? "";
    const cellType = pickOneString(o, "cell_type", ["cell_type"]);
    return {
      path: pathStr,
      edits: [
        {
          cell_index: cellIndex,
          edit_mode: editMode,
          old_string: oldStr,
          new_string: newStr,
          cell_type: cellType,
        },
      ],
    };
  }

  if (o.edit && typeof o.edit === "object") {
    const edit = parseEditObject(o.edit as Record<string, unknown>);
    return { path: pathStr, edits: [edit] };
  }

  throw new Error(
    'notebook_edit: expected {"path":"nb.ipynb","edits":[{"cell_index":0,"old_string":"…","new_string":"…"}]}',
  );
}

function parseEditObject(e: Record<string, unknown>): CellEditOp {
  const idx = e.cell_index ?? e.cellIndex ?? e.cell_number;
  if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0) {
    throw new Error("notebook_edit: each edit needs non-negative integer `cell_index`");
  }
  const oldStr = pickOneString(e, "old_string", ["old_string", "old", "oldString"]) ?? "";
  const newStr =
    pickOneString(e, "new_string", ["new_string", "new", "newString", "new_source"]) ??
    "";
  const cellType = pickOneString(e, "cell_type", ["cell_type"]);
  return {
    cell_index: idx,
    edit_mode: parseEditMode(e.edit_mode),
    old_string: oldStr,
    new_string: newStr,
    replace_all: Boolean(e.replace_all),
    cell_type: cellType,
  };
}

function parseInput(input: unknown): NotebookEditInput {
  if (!input || typeof input !== "object") {
    throw new Error("notebook_edit: input must be an object");
  }
  const o = input as Record<string, unknown>;
  const filePath = pickOneString(o, "path", ["path", "file_path", "notebook_path"]);
  if (typeof filePath !== "string" || !Array.isArray(o.edits)) {
    throw new Error(
      "notebook_edit: input requires `path` or `file_path` (string) and `edits` (array)",
    );
  }
  const edits: CellEditOp[] = [];
  for (const raw of o.edits) {
    if (!raw || typeof raw !== "object") {
      throw new Error("notebook_edit: each edit must be an object");
    }
    edits.push(parseEditObject(raw as Record<string, unknown>));
  }
  return { path: filePath, edits };
}

function sourceToString(source: unknown): string {
  if (typeof source === "string") {
    return source;
  }
  if (Array.isArray(source)) {
    return source.map((p) => (typeof p === "string" ? p : "")).join("");
  }
  if (source == null) {
    return "";
  }
  throw new Error('notebook_edit: cell "source" must be string or string[]');
}

function resetCodeCellExecution(cell: Record<string, unknown>): void {
  if (cell.cell_type === "code") {
    cell.execution_count = null;
    cell.outputs = [];
  }
}

function newCellValue(cellType: string | undefined, source: string): Record<string, unknown> {
  const ct = cellType?.toLowerCase() === "markdown" ? "markdown" : "code";
  const cell: Record<string, unknown> = {
    cell_type: ct,
    metadata: {},
    source,
    id: `drox-${hashString(source)}`,
  };
  if (ct === "code") {
    cell.execution_count = null;
    cell.outputs = [];
  }
  return cell;
}

function hashString(s: string): string {
  let h = 0xcbf29ce484222325;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x100000001b3);
  }
  return (h >>> 0).toString(16);
}

function applyCellEdits(
  cells: unknown[],
  edits: CellEditOp[],
): void {
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i]!;
    const mode = edit.edit_mode ?? "replace";
    if (mode === "delete") {
      if (edit.cell_index >= cells.length) {
        throw new Error(
          `edit #${i}: cell_index ${edit.cell_index} out of range (len=${cells.length})`,
        );
      }
      cells.splice(edit.cell_index, 1);
      continue;
    }
    if (mode === "insert") {
      if (!edit.new_string) {
        throw new Error(`edit #${i}: insert requires non-empty new_string`);
      }
      if (edit.cell_index > cells.length) {
        throw new Error(
          `edit #${i}: cell_index ${edit.cell_index} out of range for insert`,
        );
      }
      cells.splice(
        edit.cell_index,
        0,
        newCellValue(edit.cell_type, edit.new_string),
      );
      continue;
    }
    const cell = cells[edit.cell_index];
    if (!cell || typeof cell !== "object") {
      throw new Error(
        `edit #${i}: cell_index ${edit.cell_index} out of range or invalid`,
      );
    }
    const c = cell as Record<string, unknown>;
    if (!("source" in c)) {
      throw new Error(`edit #${i}: cell ${edit.cell_index} has no "source"`);
    }
    let next: string;
    if (!edit.old_string) {
      next = edit.new_string;
    } else {
      const srcStr = sourceToString(c.source);
      next = applyEdits(srcStr, [
        {
          old_string: edit.old_string,
          new_string: edit.new_string,
          replace_all: edit.replace_all,
        },
      ]);
    }
    c.source = next;
    resetCodeCellExecution(c);
  }
}

function unifiedDiff(label: string, before: string, after: string): string {
  return createTwoFilesPatch(label, label, before, after, label, label, {
    context: 3,
  });
}

/**
 * Handler `notebook_edit` : édite les cellules d’un `.ipynb` (replace / insert / delete).
 */
export function createNotebookEditHandler(): ClientToolHandler {
  return async (p: ToolExecParams): Promise<ToolExecResult> => {
    let args: NotebookEditInput;
    try {
      args = normalizeNotebookInput(p.input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { output: { error: msg }, isError: true };
    }

    if (args.edits.length === 0) {
      return {
        output: { error: "edits must not be empty" },
        isError: true,
      };
    }

    const lower = args.path.toLowerCase();
    if (!lower.endsWith(".ipynb")) {
      return {
        output: { error: "notebook_edit: path must end with .ipynb" },
        isError: true,
      };
    }

    let absPath: string;
    try {
      absPath = await resolveExistingFileUnderWorkspace(p.workspace, args.path);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { output: { error: msg }, isError: true };
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

    let nb: Record<string, unknown>;
    try {
      nb = JSON.parse(original) as Record<string, unknown>;
    } catch (e) {
      return {
        output: {
          error: `invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
        },
        isError: true,
      };
    }

    const cells = nb.cells;
    if (!Array.isArray(cells)) {
      return {
        output: { error: 'notebook missing top-level "cells" array' },
        isError: true,
      };
    }

    try {
      applyCellEdits(cells, args.edits);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { output: { error: msg }, isError: true };
    }

    let updated: string;
    try {
      updated = `${JSON.stringify(nb, null, 2)}\n`;
    } catch (e) {
      return {
        output: {
          error: `serialize failed: ${e instanceof Error ? e.message : String(e)}`,
        },
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
          error: "plan mode forbids write operation: notebook_edit",
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
      const title = `Drox — notebook_edit (${rel || path.basename(absPath)})`;
      await vscode.commands.executeCommand(
        "vscode.diff",
        leftDoc.uri,
        rightDoc.uri,
        title,
        { preview: true },
      );

      const choice = await vscode.window.showInformationMessage(
        "Appliquer les modifications du notebook sur disque ?",
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
    const entire = new vscode.Range(
      new vscode.Position(0, 0),
      new vscode.Position(lastLine, endChar),
    );
    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.replace(uri, entire, updated);
    const appliedEdit = await vscode.workspace.applyEdit(wsEdit);
    if (!appliedEdit) {
      return {
        output: { error: "workspace applyEdit was rejected" },
        isError: true,
      };
    }

    const saved = await doc.save();
    if (!saved) {
      return {
        output: {
          error:
            "notebook_edit: la modification a été appliquée dans l’éditeur mais la sauvegarde sur disque a échoué ; enregistrez le fichier manuellement puis réessayez.",
          path: pathForModel,
          cell_edits_applied: args.edits.length,
          diff,
        },
        isError: true,
      };
    }

    await recordCourseFileMutation(p.workspace, "notebook_edit", absPath, "modify");

    return {
      output: {
        applied: true,
        path: pathForModel,
        cell_edits_applied: args.edits.length,
        diff,
      },
    };
  };
}
