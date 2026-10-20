/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';
import {
	clampDroxBashTimeoutMs,
	createDroxBashStdoutMarker,
	IDroxBashExecResult,
	wrapDroxBashCommandWithMarker,
} from '../../../common/droxBash.js';
import { isolateDroxBashCapturedStdout } from '../../../common/droxBashCapture.js';
import { emitDroxBashLiveOutput } from '../../../common/droxBashLiveOutput.js';
import { droxBashShouldRevealTerminal } from '../../../common/droxBashVisibleTerminal.js';
import { IActiveIdeBashRun, setActiveIdeBashRun } from './activeRun.js';
import { collectRecentBuffer } from './buffer.js';
import { getOrCreateSharedAgentTerminal, recycleSharedAgentTerminal } from './sharedSession.js';
import { waitForDroxAgentShellReady } from './shellReady.js';

const LIVE_OUTPUT_POLL_MS = 200;
/** Post-SI: buffer often lags `onCommandFinished` (live poll saw text tool-result missed). */
const SI_SETTLE_POLL_MS = 80;
const SI_SETTLE_TRIES = 3;

/**
 * Runs a bash tool command in the shared IDE agent terminal (lot run).
 *
 * - Short one-shots: hidden session (`hideFromUser`) — output still returned to the chat card.
 * - Long-running / servers: same terminal is revealed in the Terminal panel.
 * - Agents window: caller sets `allowVisibleTerminal: false` → undefined (ExecBash fallback).
 * - Windows: always `cmd.exe` (matches engine prompts + ExecBash).
 * - Wall-clock BEFORE runCommand (lot timer) — SI wait must not block arming.
 * - P0: stdout via `droxBashCapture` after shell-ready + post-SI settle polls.
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
	const timeoutMs = clampDroxBashTimeoutMs(opts.timeoutMs);
	const reveal = droxBashShouldRevealTerminal(opts.command);
	const marker = createDroxBashStdoutMarker();
	const wrapped = wrapDroxBashCommandWithMarker(opts.command, marker, isWindows);

	let instance;
	try {
		instance = await getOrCreateSharedAgentTerminal(terminalService, opts.cwd);
		await waitForDroxAgentShellReady(instance);
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
				setActiveIdeBashRun(undefined);
				store.dispose();
				resolve(result);
			},
		};
		setActiveIdeBashRun(active);

		void (async () => {
			try {
				// Snapshot AFTER shell-ready so banner is in `before`, not in delta.
				const bufferBefore = collectRecentBuffer(instance);
				const detection = instance.capabilities.get(TerminalCapability.CommandDetection);
				if (detection) {
					store.add(detection.onCommandFinished(cmd => {
						// Ignore unrelated finishes (stale SI / prior line). Prefer
						// marker; also accept cmdline that contains the user command.
						const raw = cmd.getOutput() ?? '';
						const cmdline = typeof cmd.command === 'string' ? cmd.command : '';
						const matchesMarker = raw.includes(marker) || cmdline.includes(marker);
						const matchesUserCmd = opts.command.length > 0 && cmdline.includes(opts.command);
						if (!matchesMarker && !matchesUserCmd) {
							return;
						}
						void (async () => {
							let stdout = '';
							for (let i = 0; i < SI_SETTLE_TRIES; i++) {
								if (active.settled) {
									return;
								}
								await timeout(SI_SETTLE_POLL_MS);
								if (active.settled) {
									return;
								}
								stdout = isolateDroxBashCapturedStdout(
									raw,
									marker,
									bufferBefore,
									collectRecentBuffer(instance),
								);
								if (stdout) {
									break;
								}
							}
							if (active.settled) {
								return;
							}
							active.settle({
								command: opts.command,
								exit_code: cmd.exitCode ?? null,
								stdout,
								stderr: '',
								timed_out: false,
								duration_ms: Date.now() - started,
								terminal_instance_id: instance.instanceId,
								error: undefined,
							});
						})();
					}));
				}

				// Wall-clock BEFORE runCommand — SI wait for a clean prompt used to
				// block forever (O/N / More?) and our old timer never armed.
				const wallHandle = setTimeout(() => {
					if (active.settled) {
						return;
					}
					active.settle({
						command: opts.command,
						exit_code: null,
						stdout: isolateDroxBashCapturedStdout(
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
					void recycleSharedAgentTerminal();
				}, timeoutMs);
				store.add({ dispose: () => clearTimeout(wallHandle) });

				// Live card output: poll buffer after marker while Running.
				let lastLive = '';
				const publishLive = () => {
					if (active.settled) {
						return;
					}
					const text = isolateDroxBashCapturedStdout(
						'',
						marker,
						bufferBefore,
						collectRecentBuffer(instance),
					);
					if (text === lastLive) {
						return;
					}
					lastLive = text;
					emitDroxBashLiveOutput({ text, command: opts.command });
				};
				const liveHandle = setInterval(publishLive, LIVE_OUTPUT_POLL_MS);
				store.add({ dispose: () => clearInterval(liveHandle) });

				try {
					await instance.runCommand(wrapped, true);
				} catch {
					/* terminal may be disposed mid-wait */
				}
				publishLive();

				if (active.settled) {
					return;
				}

				if (!detection) {
					while (!active.settled) {
						publishLive();
						if (!instance.hasChildProcesses) {
							active.settle({
								command: opts.command,
								exit_code: 0,
								stdout: isolateDroxBashCapturedStdout(
									'',
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
							return;
						}
						await timeout(LIVE_OUTPUT_POLL_MS);
					}
					return;
				}

				// CommandDetection: wait for onCommandFinished or wall timeout.
				while (!active.settled) {
					await timeout(LIVE_OUTPUT_POLL_MS);
					publishLive();
				}
			} catch {
				if (!active.settled) {
					setActiveIdeBashRun(undefined);
					store.dispose();
					resolve(undefined);
				}
			}
		})();
	});
}
