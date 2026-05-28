import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";

import type { ClientToolHandler, ToolExecParams, ToolExecResult } from "../clientTools";
import { fileOpKind, recordCourseFileMutation } from "../courseCycleHook";
import {
  languageIdForFile,
  resolvePathForWrite,
  shouldConfirmFileWrites,
} from "./pathUtils";

interface FileWriteInput {
  path: string;
  content: string;
}

function parseInput(input: unknown): FileWriteInput {
  if (!input || typeof input !== "object") {
    throw new Error("file_write: input must be an object");
  }
  const o = input as Record<string, unknown>;
  if (typeof o.path !== "string" || typeof o.content !== "string") {
    throw new Error("file_write: input requires string fields `path` and `content`");
  }
  return { path: o.path, content: o.content };
}

async function pathExists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

/**
 * Handler `file_write` côté VS Code : proposition sans apply, ou diff + choix
 * utilisateur puis écriture via `vscode.workspace.fs`.
 */
export function createFileWriteHandler(): ClientToolHandler {
  return async (p: ToolExecParams): Promise<ToolExecResult> => {
    const args = parseInput(p.input);
    const absPath = await resolvePathForWrite(p.workspace, args.path);
    const pathForModel = absPath.replace(/\\/g, "/");

    if (p.planMode) {
      return {
        output: {
          error: "plan mode forbids write operation: file_write",
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
          content: args.content,
        },
      };
    }

    if (shouldConfirmFileWrites(p.workspace)) {
      const lang = languageIdForFile(absPath);
      const leftUri = (await pathExists(absPath))
        ? (await vscode.workspace.openTextDocument(vscode.Uri.file(absPath))).uri
        : (
            await vscode.workspace.openTextDocument({
              content: "",
              language: lang,
            })
          ).uri;

      const rightDoc = await vscode.workspace.openTextDocument({
        content: args.content,
        language: lang,
      });

      const rel = path.relative(p.workspace, absPath);
      const title = `Drox — file_write (${rel || path.basename(absPath)})`;
      await vscode.commands.executeCommand(
        "vscode.diff",
        leftUri,
        rightDoc.uri,
        title,
        { preview: true },
      );

      const choice = await vscode.window.showInformationMessage(
        "Appliquer l'écriture du fichier sur disque ?",
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
          },
        };
      }
    }

    const uri = vscode.Uri.file(absPath);
    const parentFs = path.dirname(absPath);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(parentFs));

    const op = await fileOpKind(absPath);
    const data = new TextEncoder().encode(args.content);
    await vscode.workspace.fs.writeFile(uri, data);

    await recordCourseFileMutation(p.workspace, "file_write", absPath, op);

    return {
      output: {
        applied: true,
        path: pathForModel,
        bytes_written: args.content.length,
      },
    };
  };
}
