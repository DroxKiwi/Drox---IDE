/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import {
	DROX_BASH_DEFAULT_TIMEOUT_MS,
	DROX_BASH_OUTPUT_CHANNEL_ID,
	IDroxBashExecResult,
} from '../../common/droxBash.js';
import {
	droxBashResultIsToolError,
	droxBashShouldRetryExecBashAfterIde,
} from '../../common/droxBashToolResult.js';
import { DROX_ENGINE_CHANNEL_NAME, DroxEngineCommand } from '../../common/droxIpc.js';
import { IDroxToolExecParams, IDroxToolExecResult } from '../../common/droxClientTools.js';
import { setActiveDroxBashSkipHandle } from './droxActiveBashGate.js';
import {
	forceInterruptDroxAgentTerminal,
	runDroxBashInIdeTerminal,
	skipActiveDroxBashInIdeTerminal,
} from './droxIdeBashTerminal/index.js';

interface IBashInput {
	command: string;
	description?: string;
	timeout_ms?: number;
}

function parseInput(input: unknown): IBashInput {
	if (!input || typeof input !== 'object') {
		throw new Error('bash: input must be an object');
	}
	const o = input as Record<string, unknown>;
	if (typeof o.command !== 'string') {
		throw new Error('bash: input requires a string `command`');
	}
	const out: IBashInput = { command: o.command };
	if (typeof o.description === 'string') {
		out.description = o.description;
	}
	if (typeof o.timeout_ms === 'number' && Number.isFinite(o.timeout_ms)) {
		out.timeout_ms = o.timeout_ms;
	}
	return out;
}

function skippedResult(command: string, started: number): IDroxBashExecResult {
	return {
		command,
		exit_code: null,
		stdout: '',
		stderr: '',
		timed_out: false,
		duration_ms: Date.now() - started,
		error: 'Skipped by user',
		skipped: true,
	};
}

export function createDroxBashToolHandler(
	mainProcessService: IMainProcessService,
	outputService: IOutputService,
	terminalService: ITerminalService,
	opts?: { readonly isSessionsWindow?: boolean },
): (p: IDroxToolExecParams) => Promise<IDroxToolExecResult> {
	const channel = mainProcessService.getChannel(DROX_ENGINE_CHANNEL_NAME);
	const allowVisibleTerminal = opts?.isSessionsWindow !== true;

	return async (p) => {
		const args = parseInput(p.input);
		const command = args.command.trim();
		if (!command) {
			return { output: { error: 'command must not be empty' }, isError: true };
		}
		if (p.planMode) {
			return { output: { error: 'plan mode forbids write operation: bash' }, isError: true };
		}

		const outChannel = outputService.getChannel(DROX_BASH_OUTPUT_CHANNEL_ID);
		const header = `$ ${command}\n# cwd: ${p.workspace ?? '(undefined)'}\n`;
		outChannel?.append(header);

		const started = Date.now();
		let skipResolve: ((result: IDroxBashExecResult) => void) | undefined;
		const skipPromise = new Promise<IDroxBashExecResult>(resolve => {
			skipResolve = resolve;
		});
		let finished = false;

		setActiveDroxBashSkipHandle({
			skip: async () => {
				if (finished) {
					return false;
				}
				// Best-effort kill: tracked IDE run, shared terminal, then ExecBash.
				const ide = skipActiveDroxBashInIdeTerminal();
				if (!ide) {
					forceInterruptDroxAgentTerminal(terminalService);
				}
				try {
					await channel.call<boolean>(DroxEngineCommand.SkipExecBash);
				} catch {
					/* main may be stale / channel down */
				}
				if (!finished) {
					skipResolve?.(skippedResult(command, started));
				}
				return true;
			},
		});

		let result: IDroxBashExecResult;
		try {
			const runPromise = (async (): Promise<IDroxBashExecResult> => {
				// IDE: shared agent terminal (hidden for one-shots, revealed for servers).
				// Agents sessions window: ExecBash only (editor terminals would cover chat).
				let r = await runDroxBashInIdeTerminal(terminalService, {
					command,
					cwd: p.workspace,
					title: args.description?.trim() || 'Drox Agent',
					timeoutMs: args.timeout_ms,
					allowVisibleTerminal,
				});
				if (!r) {
					r = await channel.call<IDroxBashExecResult>(DroxEngineCommand.ExecBash, {
						command,
						cwd: p.workspace,
						timeoutMs: args.timeout_ms,
					});
				} else if (droxBashShouldRetryExecBashAfterIde(r, command)) {
					// P1: IDE settled empty (SI/buffer miss) → one ExecBash capture retry.
					try {
						const fallback = await channel.call<IDroxBashExecResult>(DroxEngineCommand.ExecBash, {
							command,
							cwd: p.workspace,
							timeoutMs: args.timeout_ms,
						});
						if ((fallback.stdout ?? '').trim() || (fallback.stderr ?? '').trim()) {
							r = fallback;
						} else if (fallback.error || fallback.timed_out || fallback.skipped) {
							r = fallback;
						}
						// else keep IDE result (both empty — same signal to the model)
					} catch {
						/* keep IDE result if main channel fails */
					}
				}
				return r;
			})();

			result = await Promise.race([runPromise, skipPromise]);
		} finally {
			finished = true;
			setActiveDroxBashSkipHandle(undefined);
		}

		if (result.stdout) {
			outChannel?.append(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
		}
		if (result.stderr) {
			outChannel?.append(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
		}
		if (result.skipped) {
			outChannel?.append(localize('drox.bash.skipped', '[drox] skipped by user\n'));
		} else if (result.timed_out) {
			outChannel?.append(
				localize('drox.bash.timeout', '[drox] timed out after {0} ms\n', args.timeout_ms ?? DROX_BASH_DEFAULT_TIMEOUT_MS),
			);
		} else if (result.error) {
			outChannel?.append(`[drox] ${result.error}\n`);
		} else {
			outChannel?.append(`[drox] exited code=${result.exit_code ?? 'null'} in ${result.duration_ms}ms\n`);
		}

		if (result.error || result.skipped) {
			return {
				output: {
					error: result.error ?? 'Skipped by user',
					skipped: Boolean(result.skipped),
					command: result.command,
					stdout: result.stdout,
					stderr: result.stderr,
					duration_ms: result.duration_ms,
					terminal_instance_id: result.terminal_instance_id,
				},
				isError: true,
			};
		}

		return {
			output: {
				command: result.command,
				exit_code: result.exit_code,
				stdout: result.stdout,
				stderr: result.stderr,
				timed_out: result.timed_out,
				duration_ms: result.duration_ms,
				terminal_instance_id: result.terminal_instance_id,
			},
			isError: droxBashResultIsToolError(result),
		};
	};
}
