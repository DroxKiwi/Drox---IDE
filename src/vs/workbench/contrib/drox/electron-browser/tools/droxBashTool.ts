/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { DROX_BASH_OUTPUT_CHANNEL_ID, IDroxBashExecResult } from '../../common/droxBash.js';
import { DROX_ENGINE_CHANNEL_NAME, DroxEngineCommand } from '../../common/droxIpc.js';
import { IDroxToolExecParams, IDroxToolExecResult } from '../../common/droxClientTools.js';
import { runDroxBashInIdeTerminal } from './droxIdeBashTerminal.js';

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

		// IDE: shared agent terminal (hidden for one-shots, revealed for servers).
		// Agents: ExecBash only (editor terminals would cover chat).
		let result = await runDroxBashInIdeTerminal(terminalService, {
			command,
			cwd: p.workspace,
			title: args.description?.trim() || 'Drox Agent',
			timeoutMs: args.timeout_ms,
			allowVisibleTerminal,
		});
		if (!result) {
			result = await channel.call<IDroxBashExecResult>(DroxEngineCommand.ExecBash, {
				command,
				cwd: p.workspace,
				timeoutMs: args.timeout_ms,
			});
		}

		if (result.stdout) {
			outChannel?.append(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
		}
		if (result.stderr) {
			outChannel?.append(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
		}
		if (result.timed_out) {
			outChannel?.append(
				localize('drox.bash.timeout', '[drox] timed out after {0} ms\n', args.timeout_ms ?? 120_000),
			);
		} else if (result.error) {
			outChannel?.append(`[drox] ${result.error}\n`);
		} else {
			outChannel?.append(`[drox] exited code=${result.exit_code ?? 'null'} in ${result.duration_ms}ms\n`);
		}

		if (result.error) {
			return { output: { error: result.error }, isError: true };
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
			isError: (result.exit_code ?? 0) !== 0 || !!result.timed_out,
		};
	};
}
