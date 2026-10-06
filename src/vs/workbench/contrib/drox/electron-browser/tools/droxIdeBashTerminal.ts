/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import {
	createDroxBashStdoutMarker,
	extractStdoutAfterDroxBashMarker,
	IDroxBashExecResult,
	sanitizeDroxAgentTerminalCwd,
	wrapDroxBashCommandWithMarker,
} from '../../common/droxBash.js';
import { droxBashShouldRevealTerminal } from '../../common/droxBashVisibleTerminal.js';

export { sanitizeDroxAgentTerminalCwd };

const DROX_AGENT_TERMINAL_NAME = 'Drox Agent';

/** One shared hideFromUser terminal for IDE bash (Cursor-style). */
let sharedAgentTerminal: ITerminalInstance | undefined;

interface IActiveIdeBashRun {
	readonly command: string;
	readonly marker: string;
	readonly started: number;
	readonly instance: ITerminalInstance;
	settle: (result: IDroxBashExecResult) => void;
	settled: boolean;
}

/** Currently awaited IDE-terminal bash (at most one — shared agent terminal). */
let activeIdeBashRun: IActiveIdeBashRun | undefined;

/**
 * Interrupt the active IDE agent bash (Ctrl+C) and unblock the tool/exec waiter.
 * Returns true if a run was skipped.
 */
export function skipActiveDroxBashInIdeTerminal(): boolean {
	const active = activeIdeBashRun;
	if (!active || active.settled) {
		return false;
	}
	void interruptTerminal(active.instance);
	active.settle({
		command: active.command,
		exit_code: null,
		stdout: isolateCapturedStdout('', active.marker, '', collectRecentBuffer(active.instance)),
		stderr: '',
		timed_out: false,
		duration_ms: Date.now() - active.started,
		terminal_instance_id: active.instance.instanceId,
		error: 'Skipped by user',
		skipped: true,
	});
	return true;
}

export function hasActiveDroxBashInIdeTerminal(): boolean {
	return Boolean(activeIdeBashRun && !activeIdeBashRun.settled);
}

async function interruptTerminal(instance: ITerminalInstance): Promise<void> {
	try {
		// ETX — same as terminalInstance.runCommand pre-interrupt.
		await instance.sendText('\x03', false);
	} catch {
		/* terminal may already be gone */
	}
}

/**
 * Runs a bash tool command in the shared IDE agent terminal.
 *
 * - Short one-shots: hidden session (`hideFromUser`) — output still returned to the chat card.
 * - Long-running / servers: same terminal is revealed in the Terminal panel.
 * - Agents window: caller sets `allowVisibleTerminal: false` → undefined (ExecBash fallback).
 * - Windows: always `cmd.exe` (matches engine prompts + ExecBash) — never inherit user PowerShell.
 * - P0: stdout isolated via marker + buffer delta (never prior scrollback as this command's output).
 */
export async function runDroxBashInIdeTerminal(
	terminalService: ITerminalService,
	opts: {
		readonly command: string;
		readonly cwd?: string;
		readonly title?: string;
		readonly timeoutMs?: number;
		/** When false, caller should fall back to engine ExecBash. */
		readonly allowVisibleTerminal?: boolean;
	},
): Promise<IDroxBashExecResult | undefined> {
	if (opts.allowVisibleTerminal === false) {
		return undefined;
	}
	const started = Date.now();
	const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : 120_000;
	const reveal = droxBashShouldRevealTerminal(opts.command);
	const marker = createDroxBashStdoutMarker();
	const wrapped = wrapDroxBashCommandWithMarker(opts.command, marker, isWindows);

	let instance: ITerminalInstance;
	try {
		instance = await getOrCreateSharedAgentTerminal(terminalService, opts.cwd);
		if (reveal) {
			terminalService.setActiveInstance(instance);
			await terminalService.revealTerminal(instance, true);
		}
	} catch {
		return undefined;
	}

	const store = new DisposableStore();
	return new Promise<IDroxBashExecResult | undefined>((resolve) => {
		const active: IActiveIdeBashRun = {
			command: opts.command,
			marker,
			started,
			instance,
			settled: false,
			settle: (result) => {
				if (active.settled) {
					return;
				}
				active.settled = true;
				if (activeIdeBashRun === active) {
					activeIdeBashRun = undefined;
				}
				store.dispose();
				resolve(result);
			},
		};
		activeIdeBashRun = active;

		void (async () => {
			try {
				const bufferBefore = collectRecentBuffer(instance);
				const detection = instance.capabilities.get(TerminalCapability.CommandDetection);
				if (detection) {
					store.add(detection.onCommandFinished(cmd => {
						const raw = cmd.getOutput() ?? '';
						active.settle({
							command: opts.command,
							exit_code: cmd.exitCode ?? null,
							stdout: isolateCapturedStdout(
								raw,
								marker,
								bufferBefore,
								collectRecentBuffer(instance),
							),
							stderr: '',
							timed_out: false,
							duration_ms: Date.now() - started,
							terminal_instance_id: instance.instanceId,
							error: undefined,
						});
					}));
				}

				await instance.runCommand(wrapped, true);

				if (active.settled) {
					return;
				}

				if (detection) {
					await Promise.race([
						timeout(timeoutMs),
						new Promise<void>(r => {
							const iv = setInterval(() => {
								if (active.settled) {
									clearInterval(iv);
									r();
								}
							}, 50);
						}),
					]);
					if (active.settled) {
						return;
					}
					active.settle({
						command: opts.command,
						exit_code: null,
						stdout: isolateCapturedStdout(
							'',
							marker,
							bufferBefore,
							collectRecentBuffer(instance),
						),
						stderr: '',
						timed_out: true,
						duration_ms: Date.now() - started,
						terminal_instance_id: instance.instanceId,
						error: undefined,
					});
					return;
				}

				const deadline = Date.now() + timeoutMs;
				while (Date.now() < deadline && !active.settled) {
					await timeout(200);
					if (!instance.hasChildProcesses) {
						break;
					}
				}
				if (active.settled) {
					return;
				}
				const timedOut = instance.hasChildProcesses;
				active.settle({
					command: opts.command,
					exit_code: timedOut ? null : 0,
					stdout: isolateCapturedStdout(
						'',
						marker,
						bufferBefore,
						collectRecentBuffer(instance),
					),
					stderr: '',
					timed_out: timedOut,
					duration_ms: Date.now() - started,
					terminal_instance_id: instance.instanceId,
					error: undefined,
				});
			} catch {
				if (!active.settled) {
					activeIdeBashRun = undefined;
					store.dispose();
					resolve(undefined);
				}
			}
		})();
	});
}

async function getOrCreateSharedAgentTerminal(
	terminalService: ITerminalService,
	cwd: string | undefined,
): Promise<ITerminalInstance> {
	if (sharedAgentTerminal && !sharedAgentTerminal.isDisposed) {
		const stillKnown = terminalService.getInstanceFromId(sharedAgentTerminal.instanceId);
		if (stillKnown) {
			return stillKnown;
		}
	}
	const safeCwd = sanitizeDroxAgentTerminalCwd(cwd);
	const instance = await terminalService.createTerminal({
		config: {
			name: DROX_AGENT_TERMINAL_NAME,
			hideFromUser: true,
			isFeatureTerminal: true,
			forceShellIntegration: true,
			// Align with droxBashExec / prompts: Windows agent shell is cmd.exe, not user PS profile.
			...(isWindows ? { executable: 'cmd.exe' } : {}),
		},
		cwd: safeCwd ? URI.file(safeCwd) : undefined,
		location: TerminalLocation.Panel,
	});
	sharedAgentTerminal = instance;
	return instance;
}

/**
 * Prefer marker slice; else buffer delta. Never return prior scrollback as this run's stdout.
 */
function isolateCapturedStdout(
	commandDetectionOutput: string,
	marker: string,
	bufferBefore: string,
	bufferAfter: string,
): string {
	const fromDetection = extractStdoutAfterDroxBashMarker(commandDetectionOutput, marker);
	if (fromDetection || commandDetectionOutput.includes(marker)) {
		return fromDetection;
	}
	const fromBuffer = extractStdoutAfterDroxBashMarker(bufferAfter, marker);
	if (fromBuffer || bufferAfter.includes(marker)) {
		return fromBuffer;
	}
	return bufferDeltaSince(bufferBefore, bufferAfter);
}

/** Prefer new buffer content only — empty if we cannot isolate this run. */
function bufferDeltaSince(before: string, after: string): string {
	if (!after) {
		return '';
	}
	if (!before) {
		return after;
	}
	if (after.startsWith(before)) {
		return after.slice(before.length).replace(/^\r?\n/, '');
	}
	if (after.endsWith(before)) {
		return after.slice(0, after.length - before.length).replace(/\r?\n$/, '');
	}
	return '';
}

function collectRecentBuffer(instance: ITerminalInstance): string {
	const xterm = instance.xterm;
	if (!xterm) {
		return '';
	}
	const lines: string[] = [];
	let n = 0;
	for (const line of xterm.getBufferReverseIterator()) {
		lines.push(line);
		if (++n >= 200) {
			break;
		}
	}
	return lines.reverse().join('\n');
}
