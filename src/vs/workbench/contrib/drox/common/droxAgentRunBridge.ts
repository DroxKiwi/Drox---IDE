/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { ILogService } from '../../../../platform/log/common/log.js';
import { IDroxAgentRunImage } from './droxAttachments.js';
import { IDroxClientToolsService } from './droxClientToolsService.js';
import { IDroxEngineService } from './droxEngineService.js';
import { IDroxRunSettingsService } from './droxRunSettingsService.js';
import { truncateUserPromptForEngine } from './droxUserPromptEngine.js';

export interface IDroxAgentRunBridgeDeps {
	readonly clientToolsService: IDroxClientToolsService;
	readonly runSettingsService: IDroxRunSettingsService;
	readonly droxEngineService: IDroxEngineService;
	readonly logService: ILogService;
}

export interface IDroxAgentRunStartOptions {
	readonly prompt: string;
	readonly workspace: string;
	readonly mode: string;
	readonly sessionId: string;
	readonly images?: readonly IDroxAgentRunImage[];
	readonly skipUserTurn?: boolean;
	readonly runObjective?: string;
}

/** Initialise `drox.exe` pour un run agent (tools exécutables + ask interactif). */
export async function initializeDroxEngineForAgentRun(deps: IDroxAgentRunBridgeDeps): Promise<void> {
	const allTools = deps.clientToolsService.executableToolNames;
	const executableTools = deps.runSettingsService.filterExecutableTools(allTools);
	await deps.droxEngineService.initialize({
		executableTools: [...executableTools],
		interactiveAsk: true,
	});
}

/** Lance `agent.run` ; retourne le `runId` ou `undefined` si le moteur n'en fournit pas. */
export async function startDroxAgentRun(
	deps: IDroxAgentRunBridgeDeps,
	options: IDroxAgentRunStartOptions,
): Promise<string | undefined> {
	await initializeDroxEngineForAgentRun(deps);
	const runParams = deps.runSettingsService.buildAgentRunParams({
		prompt: truncateUserPromptForEngine(options.prompt),
		workspace: options.workspace,
		mode: options.mode,
		sessionId: options.sessionId,
		images: options.images && options.images.length > 0 ? [...options.images] : undefined,
		skipUserTurn: options.skipUserTurn,
		runObjective: options.runObjective,
	});
	const result = await deps.droxEngineService.request('agent.run', runParams) as { runId?: string };
	if (typeof result?.runId === 'string') {
		deps.logService.info('[Drox] agent.run', result.runId);
		return result.runId;
	}
	deps.logService.warn('[Drox] agent.run returned no runId');
	return undefined;
}

/** Annule un run en cours (`agent.cancel`). */
export async function cancelDroxAgentRun(
	deps: Pick<IDroxAgentRunBridgeDeps, 'droxEngineService' | 'logService'>,
	runId: string,
	logLabel = 'agent.cancel',
): Promise<void> {
	try {
		await deps.droxEngineService.request('agent.cancel', { runId });
	} catch (e) {
		deps.logService.warn(`[Drox] ${logLabel}`, e);
	}
}
