/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { IDroxBashExecResult } from '../../common/droxBash.js';
import { droxBashShouldRevealTerminal } from '../../common/droxBashVisibleTerminal.js';

const DROX_AGENT_TERMINAL_NAME = 'Drox Agent';

/** One shared hideFromUser terminal for IDE bash (Cursor-style). */
let sharedAgentTerminal: ITerminalInstance | undefined;

/**
 * Runs a bash tool command in the shared IDE agent terminal.
 *
 * - Short one-shots: hidden session (`hideFromUser`) — output still returned to the chat card.
 * - Long-running / servers: same terminal is revealed in the Terminal panel.
 * - Agents window: caller sets `allowVisibleTerminal: false` → undefined (ExecBash fallback).
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
	try {
		const detection = instance.capabilities.get(TerminalCapability.CommandDetection);
		const finished = new Promise<IDroxBashExecResult>(resolve => {
			if (!detection) {
				return;
			}
			store.add(detection.onCommandFinished(cmd => {
				resolve({
					command: opts.command,
					exit_code: cmd.exitCode ?? null,
					stdout: cmd.getOutput() ?? '',
					stderr: '',
					timed_out: false,
					duration_ms: Date.now() - started,
					terminal_instance_id: instance.instanceId,
					error: undefined,
				});
			}));
		});

		await instance.runCommand(opts.command, true);

		if (detection) {
			const raced = await Promise.race([
				finished,
				timeout(timeoutMs).then(() => undefined),
			]);
			if (raced) {
				return raced;
			}
			return {
				command: opts.command,
				exit_code: null,
				stdout: collectRecentBuffer(instance),
				stderr: '',
				timed_out: true,
				duration_ms: Date.now() - started,
				terminal_instance_id: instance.instanceId,
				error: undefined,
			};
		}

		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			await timeout(200);
			if (!instance.hasChildProcesses) {
				break;
			}
		}
		const timedOut = instance.hasChildProcesses;
		return {
			command: opts.command,
			exit_code: timedOut ? null : 0,
			stdout: collectRecentBuffer(instance),
			stderr: '',
			timed_out: timedOut,
			duration_ms: Date.now() - started,
			terminal_instance_id: instance.instanceId,
			error: undefined,
		};
	} catch {
		return undefined;
	} finally {
		store.dispose();
	}
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
	const instance = await terminalService.createTerminal({
		config: {
			name: DROX_AGENT_TERMINAL_NAME,
			hideFromUser: true,
			isFeatureTerminal: true,
			forceShellIntegration: true,
		},
		cwd: cwd ? URI.file(cwd) : undefined,
		location: TerminalLocation.Panel,
	});
	sharedAgentTerminal = instance;
	return instance;
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
