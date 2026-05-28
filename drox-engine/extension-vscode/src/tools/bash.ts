import { spawn } from "node:child_process";
import * as os from "node:os";
import * as vscode from "vscode";

import type { ClientToolHandler, ToolExecParams, ToolExecResult } from "../clientTools";

interface BashInput {
  command: string;
  description?: string;
  timeout_ms?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_STREAM_BYTES = 30 * 1024;

function parseInput(input: unknown): BashInput {
  if (!input || typeof input !== "object") {
    throw new Error("bash: input must be an object");
  }
  const o = input as Record<string, unknown>;
  if (typeof o.command !== "string") {
    throw new Error("bash: input requires a string `command`");
  }
  const out: BashInput = { command: o.command };
  if (typeof o.description === "string") {
    out.description = o.description;
  }
  if (typeof o.timeout_ms === "number" && Number.isFinite(o.timeout_ms)) {
    out.timeout_ms = o.timeout_ms;
  }
  return out;
}

/**
 * Choisit le shell par défaut de l'OS, mêmes invariants que `BashTool` côté
 * Rust (`cmd /C` sous Windows, `sh -c` ailleurs).
 */
function shellSpec(): { cmd: string; flag: string } {
  if (os.platform() === "win32") {
    return { cmd: "cmd.exe", flag: "/C" };
  }
  return { cmd: "sh", flag: "-c" };
}

/**
 * Sous Windows, `cmd.exe` refuse les cwd UNC (`\\server\share`) ou les
 * chemins étendus `\\?\C:\…` et bascule alors dans `C:\Windows`. On retire
 * ces préfixes pour rester dans un cwd que cmd accepte.
 */
function sanitizeCwd(cwd: string | undefined): string | undefined {
  if (!cwd || os.platform() !== "win32") {
    return cwd;
  }
  let p = cwd;
  if (p.startsWith("\\\\?\\UNC\\")) {
    p = "\\\\" + p.slice("\\\\?\\UNC\\".length);
  } else if (p.startsWith("\\\\?\\")) {
    p = p.slice(4);
  }
  return p;
}

interface CaptureBuf {
  parts: string[];
  size: number;
  truncated: boolean;
}

function newBuf(): CaptureBuf {
  return { parts: [], size: 0, truncated: false };
}

function pushChunk(buf: CaptureBuf, chunk: Buffer | string): void {
  if (buf.truncated) {
    return;
  }
  const str = typeof chunk === "string" ? chunk : chunk.toString("utf8");
  const remaining = MAX_STREAM_BYTES - buf.size;
  if (str.length <= remaining) {
    buf.parts.push(str);
    buf.size += str.length;
    return;
  }
  if (remaining > 0) {
    buf.parts.push(str.slice(0, remaining));
    buf.size += remaining;
  }
  buf.parts.push("\n…[truncated]");
  buf.truncated = true;
}

function joinBuf(buf: CaptureBuf): string {
  return buf.parts.join("");
}

let sharedOutput: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!sharedOutput) {
    sharedOutput = vscode.window.createOutputChannel("Drox (bash)");
  }
  return sharedOutput;
}

/**
 * Handler `bash` côté VS Code : exécute la commande dans un sous-processus
 * shell (`cmd /C` / `sh -c`) avec `cwd = params.workspace`, capture stdout +
 * stderr (avec troncature à 30 KiB par flux) et applique un timeout.
 *
 * Les flux sont également mirrorés dans une `OutputChannel` partagée
 * « Drox (bash) » pour que l'utilisateur voie la commande tourner en direct
 * dans l'UI. Le terminal intégré n'est pas utilisé : il est difficile d'y
 * capter le flux de manière fiable, et l'agent a besoin du `stdout` brut.
 */
export function createBashHandler(): ClientToolHandler {
  return async (p: ToolExecParams): Promise<ToolExecResult> => {
    const args = parseInput(p.input);
    const command = args.command.trim();
    if (!command) {
      return {
        output: { error: "command must not be empty" },
        isError: true,
      };
    }

    if (p.planMode) {
      return {
        output: { error: "plan mode forbids write operation: bash" },
        isError: true,
      };
    }

    const timeoutMs = Math.min(
      args.timeout_ms ?? DEFAULT_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    );

    const channel = getOutputChannel();
    const safeCwd = sanitizeCwd(p.workspace);
    channel.appendLine(`$ ${command}`);
    channel.appendLine(`# cwd: ${safeCwd ?? "(non défini)"}`);
    if (args.description) {
      channel.appendLine(`# ${args.description}`);
    }

    const { cmd, flag } = shellSpec();
    const stdoutBuf = newBuf();
    const stderrBuf = newBuf();
    const started = Date.now();

    return await new Promise<ToolExecResult>((resolve) => {
      const child = spawn(cmd, [flag, command], {
        cwd: safeCwd,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let settled = false;
      const settle = (res: ToolExecResult) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(res);
      };

      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
        const duration_ms = Date.now() - started;
        channel.appendLine(`[drox] timed out after ${timeoutMs} ms`);
        settle({
          output: {
            command,
            exit_code: null,
            stdout: joinBuf(stdoutBuf),
            stderr: joinBuf(stderrBuf),
            stdout_truncated: stdoutBuf.truncated,
            stderr_truncated: stderrBuf.truncated,
            timed_out: true,
            duration_ms,
            description: args.description ?? null,
          },
        });
      }, timeoutMs);

      child.stdout?.on("data", (chunk: Buffer) => {
        pushChunk(stdoutBuf, chunk);
        channel.append(chunk.toString("utf8"));
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        pushChunk(stderrBuf, chunk);
        channel.append(chunk.toString("utf8"));
      });

      child.on("error", (err) => {
        channel.appendLine(`[drox] spawn error: ${err.message}`);
        settle({
          output: { error: `spawn failed: ${err.message}` },
          isError: true,
        });
      });

      child.on("close", (code, signal) => {
        const duration_ms = Date.now() - started;
        channel.appendLine(
          `[drox] exited code=${code ?? "null"} signal=${signal ?? "none"} in ${duration_ms}ms`,
        );
        settle({
          output: {
            command,
            exit_code: code,
            stdout: joinBuf(stdoutBuf),
            stderr: joinBuf(stderrBuf),
            stdout_truncated: stdoutBuf.truncated,
            stderr_truncated: stderrBuf.truncated,
            timed_out: false,
            duration_ms,
            description: args.description ?? null,
          },
        });
      });
    });
  };
}
