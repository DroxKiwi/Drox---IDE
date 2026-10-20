/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { TerminalLocation } from '../../../../../../platform/terminal/common/terminal.js';
import { ITerminalInstance, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { sanitizeDroxAgentTerminalCwd } from '../../../common/droxBash.js';

/**
 * Singleton terminal « Drox Agent » + recycle (lot session / poison O/N).
 * Revert recycle = ne plus appeler `recycleSharedAgentTerminal` depuis skip/timeout.
 */

export const DROX_AGENT_TERMINAL_NAME = 'Drox Agent';

let sharedAgentTerminal: ITerminalInstance | undefined;
let sharedAgentTerminalService: ITerminalService | undefined;

export function getSharedAgentTerminal(): ITerminalInstance | undefined {
	return sharedAgentTerminal;
}

/**
 * Best-effort find when the singleton was cleared but a "Drox Agent" panel
 * terminal is still alive (Skip must still reach it).
 */
export function findDroxAgentTerminal(
	terminalService: ITerminalService,
): ITerminalInstance | undefined {
	if (sharedAgentTerminal && !sharedAgentTerminal.isDisposed) {
		return sharedAgentTerminal;
	}
	for (const inst of terminalService.instances) {
		if (inst.isDisposed) {
			continue;
		}
		const title = (inst.title || inst.shellLaunchConfig?.name || '').trim();
		if (title === DROX_AGENT_TERMINAL_NAME || title.startsWith(`${DROX_AGENT_TERMINAL_NAME} `)) {
			return inst;
		}
	}
	return undefined;
}

export async function interruptTerminal(instance: ITerminalInstance): Promise<void> {
	try {
		await instance.sendText('\x03', false);
	} catch {
		/* terminal may already be gone */
	}
}

/**
 * Kill the shared agent shell and clear the singleton so the next bash gets a
 * fresh cmd.exe (purges Windows "Terminer le programme (O/N)?" poison).
 */
export async function recycleSharedAgentTerminal(): Promise<void> {
	const instance = sharedAgentTerminal;
	const service = sharedAgentTerminalService;
	sharedAgentTerminal = undefined;
	if (!instance || instance.isDisposed) {
		return;
	}
	try {
		await interruptTerminal(instance);
	} catch {
		/* ignore */
	}
	try {
		if (service) {
			await service.safeDisposeTerminal(instance);
		} else {
			instance.dispose();
		}
	} catch {
		/* already gone */
	}
}

export async function getOrCreateSharedAgentTerminal(
	terminalService: ITerminalService,
	cwd: string | undefined,
): Promise<ITerminalInstance> {
	if (sharedAgentTerminal && !sharedAgentTerminal.isDisposed) {
		const stillKnown = terminalService.getInstanceFromId(sharedAgentTerminal.instanceId);
		if (stillKnown) {
			return stillKnown;
		}
	}
	sharedAgentTerminalService = terminalService;
	const safeCwd = sanitizeDroxAgentTerminalCwd(cwd);
	const instance = await terminalService.createTerminal({
		config: {
			name: DROX_AGENT_TERMINAL_NAME,
			hideFromUser: true,
			isFeatureTerminal: true,
			forceShellIntegration: true,
			...(isWindows ? { executable: 'cmd.exe' } : {}),
		},
		cwd: safeCwd ? URI.file(safeCwd) : undefined,
		location: TerminalLocation.Panel,
	});
	sharedAgentTerminal = instance;
	return instance;
}
