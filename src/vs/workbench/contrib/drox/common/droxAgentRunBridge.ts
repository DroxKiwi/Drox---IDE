/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IDroxAgentRunImage } from './droxAttachments.js';
import { IDroxClientToolsService } from './droxClientToolsService.js';
import { IDroxEngineService } from './droxEngineService.js';
import { IDroxRunSettingsService } from './droxRunSettingsService.js';
import {
	ensureDroxSessionNotesFile,
	readDroxSessionNotesSystemSupplement,
} from './droxSessionNotesFs.js';
import { consumeDroxPlanArchiveSystemNote } from './droxPlanArchiveNote.js';
import { truncateUserPromptForEngine } from './droxUserPromptEngine.js';
import { IDroxCodebaseContextService } from './codebase/droxCodebaseContextService.js';
import {
	applyDroxRegulationL1SessionNotes,
	asDroxRegulationL1Module,
} from './regulation/droxRegulationL1Budget.js';
import {
	applyDroxRegulationL2DisabledTools,
	applyDroxRegulationL2ExecutableTools,
	asDroxRegulationL2Module,
} from './regulation/droxRegulationL2Surface.js';
import {
	applyDroxRegulationL3Directive,
	asDroxRegulationL3Module,
} from './regulation/droxRegulationL3Directive.js';
import {
	applyDroxRegulationL4Protocol,
	asDroxRegulationL4Module,
} from './regulation/droxRegulationL4Protocol.js';
import { IDroxRegulationService } from './regulation/droxRegulationServiceContract.js';
import { droxSubagentsEnabledForRun } from './droxSubagents.js';

export interface IDroxAgentRunBridgeDeps {
	readonly clientToolsService: IDroxClientToolsService;
	readonly runSettingsService: IDroxRunSettingsService;
	readonly droxEngineService: IDroxEngineService;
	readonly logService: ILogService;
	/** Optionnel : carnet session (N0) injecté dans `system`. */
	readonly fileService?: IFileService;
	/** Optionnel : hint + pack `@Codebase` (CB4 auto-inject / force). */
	readonly codebaseContextService?: IDroxCodebaseContextService;
	/**
	 * When force-next is armed: resolve editor path prefixes under workspace
	 * (browser supplies active editor; common layer stays editor-free).
	 */
	readonly resolveCodebaseForcePathPrefixes?: (workspaceFsPath: string) => string[] | undefined;
	/** Optionnel : L1 notes + L2 tools + L3 directive + L4 protocol. */
	readonly regulationService?: Pick<IDroxRegulationService, 'getModule'>;
}

export interface IDroxAgentRunStartOptions {
	readonly prompt: string;
	readonly workspace: string;
	readonly mode: string;
	readonly sessionId: string;
	readonly images?: readonly IDroxAgentRunImage[];
	readonly skipUserTurn?: boolean;
	readonly runObjective?: string;
	readonly allowOutsideWorkspace?: boolean;
	/** Override system (sinon chargé depuis le carnet si `fileService` présent). */
	readonly system?: string;
}

function resolveExecutableTools(deps: IDroxAgentRunBridgeDeps): string[] {
	const filtered = deps.runSettingsService.filterExecutableTools(
		deps.clientToolsService.executableToolNames,
	);
	if (!deps.regulationService) {
		return [...filtered];
	}
	const l2 = asDroxRegulationL2Module(deps.regulationService.getModule('L2'));
	return applyDroxRegulationL2ExecutableTools(l2, filtered);
}

/** Initialise `drox.exe` pour un run agent (tools exécutables + ask interactif). */
export async function initializeDroxEngineForAgentRun(deps: IDroxAgentRunBridgeDeps): Promise<void> {
	await deps.droxEngineService.initialize({
		executableTools: resolveExecutableTools(deps),
		interactiveAsk: true,
	});
}

/** Lance `agent.run` ; retourne le `runId` ou `undefined` si le moteur n'en fournit pas. */
export async function startDroxAgentRun(
	deps: IDroxAgentRunBridgeDeps,
	options: IDroxAgentRunStartOptions,
): Promise<string | undefined> {
	await initializeDroxEngineForAgentRun(deps);
	let system = options.system;
	if (!system?.trim() && deps.fileService) {
		await ensureDroxSessionNotesFile(deps.fileService, options.workspace, options.sessionId);
		system = await readDroxSessionNotesSystemSupplement(
			deps.fileService,
			options.workspace,
			options.sessionId,
		);
	}
	if (deps.regulationService) {
		const l1 = asDroxRegulationL1Module(deps.regulationService.getModule('L1'));
		system = applyDroxRegulationL1SessionNotes(l1, system);
		const l3 = asDroxRegulationL3Module(deps.regulationService.getModule('L3'));
		system = applyDroxRegulationL3Directive(l3, system);
		const l4 = asDroxRegulationL4Module(deps.regulationService.getModule('L4'));
		system = applyDroxRegulationL4Protocol(l4, system);
	}
	const planArchiveNote = consumeDroxPlanArchiveSystemNote(options.sessionId);
	if (planArchiveNote) {
		system = system?.trim() ? `${planArchiveNote}\n\n${system}` : planArchiveNote;
	}
	if (deps.codebaseContextService) {
		try {
			const forcePathPrefixes = deps.codebaseContextService.forceNextRun
				? deps.resolveCodebaseForcePathPrefixes?.(options.workspace)
				: undefined;
			const codebaseSystem = await deps.codebaseContextService.buildSystemSupplement(
				options.workspace,
				options.prompt,
				forcePathPrefixes?.length ? { pathPrefixes: forcePathPrefixes } : undefined,
			);
			if (codebaseSystem?.trim()) {
				system = system?.trim() ? `${system}\n\n${codebaseSystem}` : codebaseSystem;
			}
		} catch (e) {
			deps.logService.trace('[Drox] codebase context inject skipped', e);
		}
	}
	const runParams = deps.runSettingsService.buildAgentRunParams({
		prompt: truncateUserPromptForEngine(options.prompt),
		workspace: options.workspace,
		mode: options.mode,
		sessionId: options.sessionId,
		images: options.images && options.images.length > 0 ? [...options.images] : undefined,
		skipUserTurn: options.skipUserTurn,
		runObjective: options.runObjective,
		allowOutsideWorkspace: options.allowOutsideWorkspace,
		system: system?.trim() ? system : undefined,
	}) as Record<string, unknown>;
	if (deps.regulationService) {
		const l2 = asDroxRegulationL2Module(deps.regulationService.getModule('L2'));
		const existing = Array.isArray(runParams.disabledTools)
			? (runParams.disabledTools as string[])
			: [];
		const disabled = applyDroxRegulationL2DisabledTools(l2, existing);
		if (disabled.length > 0) {
			runParams.disabledTools = disabled;
		} else {
			delete runParams.disabledTools;
		}
		// Explore master × L2: strip RPC flags when core or kill-switch off.
		const masterOn = runParams.subagentsEnabled === true;
		if (!droxSubagentsEnabledForRun(masterOn, l2)) {
			delete runParams.subagentsEnabled;
			delete runParams.subagentsMaxIterations;
			delete runParams.subagentsMaxConcurrent;
		}
	} else if (runParams.subagentsEnabled !== true) {
		delete runParams.subagentsEnabled;
		delete runParams.subagentsMaxIterations;
		delete runParams.subagentsMaxConcurrent;
	}
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
