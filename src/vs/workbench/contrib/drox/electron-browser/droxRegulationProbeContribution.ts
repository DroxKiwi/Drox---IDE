/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IDroxChatSessionService } from '../common/droxChatSessionService.js';
import { IDroxEngineService } from '../common/droxEngineService.js';
import { droxRegulationPromptExcerptFromMessages } from '../common/regulation/droxRegulationHistoryStore.js';
import { buildDroxRegulationRunSignals } from '../common/regulation/droxRegulationRunSignals.js';
import { IDroxRegulationService } from '../common/regulation/droxRegulationServiceContract.js';
import { droxRegulationModelKey } from '../common/regulation/droxRegulationTypes.js';
import { IDroxRunSettingsService } from '../common/droxRunSettingsService.js';
import { IDroxSessionService } from '../common/droxSessionService.js';

/**
 * Scores every finished agent.run (chat IDE + Agents). Auto ON/OFF only affects
 * module retargeting — never whether notes/history are recorded.
 */
class DroxRegulationProbeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxRegulationProbe';

	constructor(
		@IDroxEngineService private readonly engineService: IDroxEngineService,
		@IDroxRegulationService private readonly regulationService: IDroxRegulationService,
		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,
		@IDroxChatSessionService private readonly chatSessionService: IDroxChatSessionService,
		@IDroxSessionService private readonly sessionService: IDroxSessionService,
	) {
		super();
		this._register(this.engineService.onNotification(payload => {
			if (payload.method !== 'agent/done') {
				return;
			}
			void this.onAgentDone(payload.params);
		}));
	}

	private async onAgentDone(params: unknown): Promise<void> {
		const p = params as { runId?: string; run_id?: string; status?: string; error?: string } | undefined;
		const runId = typeof p?.runId === 'string' ? p.runId : p?.run_id;
		const llm = this.runSettingsService.getLlmSettings();
		const modelKey = droxRegulationModelKey(llm.llmProvider, llm.model);
		const sessionId = this.chatSessionService.getSessionId();
		const workspace = this.runSettingsService.getWorkspaceResource()?.fsPath;
		let engineTrace;
		let uiStats;
		let messages;
		if (sessionId && workspace) {
			try {
				await this.regulationService.ensureHistoryLoaded(workspace);
				const read = await this.sessionService.readSession(sessionId, workspace);
				engineTrace = read.engineTrace;
				uiStats = read.uiStats;
				messages = read.messages;
			} catch {
				// Session read best-effort — score from done payload only.
			}
		}
		const signals = buildDroxRegulationRunSignals({
			status: p?.status,
			error: p?.error,
			engineTrace,
			uiStats,
			messages,
		});
		this.regulationService.recordRun({
			modelKey,
			signals,
			sessionId,
			runId,
			promptExcerpt: droxRegulationPromptExcerptFromMessages(messages),
			workspaceRootFsPath: workspace,
			issueDetail: typeof p?.error === 'string' ? p.error.slice(0, 240) : undefined,
		});
	}
}

registerWorkbenchContribution2(
	DroxRegulationProbeContribution.ID,
	DroxRegulationProbeContribution,
	WorkbenchPhase.Eventually,
);
