/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { localize, localize2 } from '../../../../nls.js';
import { basename, dirname, join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions as OutputExtensions, IOutputChannelRegistry, IOutputService } from '../../../services/output/common/output.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { isDroxDevFeatureEnabled } from '../common/droxDevSurface.js';
import { HISTORY_PROBE_LAB_DIR, HISTORY_PROBE_RESULTS_DIR, HISTORY_PROBE_SCENARIO } from '../common/historyProbeScenario.js';
import { IDroxChatSessionService } from '../common/droxChatSessionService.js';
import { IDroxEngineService } from '../common/droxEngineService.js';
import { IDroxRunSettingsService } from '../common/droxRunSettingsService.js';

const HISTORY_PROBE_OUTPUT_ID = 'droxHistoryProbe';

type ProbeControl = {
	aborted: boolean;
	runId?: string;
	readonly engine: IDroxEngineService;
	readonly wake: Array<() => void>;
};

let activeProbe: ProbeControl | undefined;

function abortHistoryProbe(): boolean {
	const probe = activeProbe;
	if (!probe) {
		return false;
	}
	probe.aborted = true;
	for (const wake of probe.wake.splice(0)) {
		wake();
	}
	if (probe.runId) {
		void probe.engine.request('agent.cancel', { runId: probe.runId }).catch(() => undefined);
	}
	return true;
}

type ProbeEntry = { role?: string; chars?: number; head?: string; text?: string; tools?: string[] };
type ProbeCall = { call: number; runId: string; entries: ProbeEntry[] };

/**
 * Palette dev : joue un script court dans une session moteur dédiée
 * (pas le chat ouvert) et écrit chaque historique réellement envoyé au modèle.
 * La commande n'est pas enregistrée quand `droxSurface` vaut `release`.
 */
class DroxHistoryProbeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxHistoryProbe';

	constructor(
		@IProductService productService: IProductService,
	) {
		super();
		if (!isDroxDevFeatureEnabled('historyProbe', productService)) {
			return;
		}
		Registry.as<IOutputChannelRegistry>(OutputExtensions.OutputChannels).registerChannel({
			id: HISTORY_PROBE_OUTPUT_ID,
			label: localize('drox.historyProbe.output', 'Drox (history probe)'),
			log: false,
		});
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'drox.historyProbe.play',
					title: localize2('drox.historyProbe.play', 'Drox: History Probe (Dev)'),
					f1: true,
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				await playHistoryProbe(accessor);
			}
		}));
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'drox.historyProbe.abort',
					title: localize2('drox.historyProbe.abort', 'Drox: Abort History Probe (Dev)'),
					f1: true,
				});
			}

			override run(accessor: ServicesAccessor): void {
				if (!abortHistoryProbe()) {
					accessor.get(INotificationService).notify({
						severity: Severity.Info,
						message: localize('drox.historyProbe.notRunning', 'History probe : aucun test en cours.'),
					});
				}
			}
		}));
	}
}

async function playHistoryProbe(accessor: ServicesAccessor): Promise<void> {
	const engine = accessor.get(IDroxEngineService);
	const settings = accessor.get(IDroxRunSettingsService);
	const output = accessor.get(IOutputService);
	const files = accessor.get(IFileService);
	const chat = accessor.get(IDroxChatSessionService);
	const notify = accessor.get(INotificationService);
	const workspace = settings.getWorkspaceResource()?.fsPath;
	if (!workspace || basename(workspace) !== HISTORY_PROBE_LAB_DIR) {
		notify.notify({ severity: Severity.Warning, message: localize('drox.historyProbe.noWorkspace', 'History probe : ouvre le dossier history-probe-lab du dépôt Drox.') });
		return;
	}
	const llm = settings.getLlmSettings();
	if (!llm.model?.trim()) {
		notify.notify({ severity: Severity.Warning, message: localize('drox.historyProbe.noModel', 'History probe : connecte un modèle dans le chat Drox, puis relance.') });
		return;
	}

	if (chat.getRunId() || chat.hasActiveRun()) {
		notify.notify({ severity: Severity.Warning, message: localize('drox.historyProbe.busy', 'History probe : un run Drox est déjà en cours. Attends qu\'il se termine.') });
		return;
	}

	const channel = output.getChannel(HISTORY_PROBE_OUTPUT_ID);
	if (!channel) {
		notify.notify({ severity: Severity.Error, message: localize('drox.historyProbe.noChannel', 'History probe : canal de sortie indisponible.') });
		return;
	}
	channel.clear();
	void output.showChannel(HISTORY_PROBE_OUTPUT_ID, true);
	const sessionId = `ses_${generateUuid()}`;
	channel.append(`session ${sessionId}\nprofile ${llm.engineProfile}\nmodel ${llm.model}\n\n`);

	await engine.start();
	const calls: ProbeCall[] = [];
	let error: string | undefined;
	const listener = engine.onNotification(payload => {
		if (payload.method !== 'agent/event') {
			return;
		}
		const params = payload.params as { runId?: string; event?: { kind?: string; entries?: ProbeEntry[] } } | undefined;
		const event = params?.event;
		if (event?.kind !== 'history_probe' || !params?.runId) {
			return;
		}
		const record: ProbeCall = {
			call: calls.length + 1,
			runId: params.runId,
			entries: event.entries ?? [],
		};
		calls.push(record);
		channel.append(`--- appel LLM ${record.call} (run ${record.runId}) ---\n`);
		for (const entry of record.entries) {
			const tools = entry.tools?.length ? ` tools=${entry.tools.join(',')}` : '';
			const head = (entry.head ?? '').replace(/\s+/g, ' ').slice(0, 240);
			channel.append(`${entry.role} ${entry.chars ?? 0}c${tools}\n  ${head}\n`);
		}
		channel.append('\n');
	});

	const turns: Array<{ index: number; prompt: string; runId?: string }> = [];
	const probe: ProbeControl = { aborted: false, engine, wake: [] };
	const previousSessionId = chat.getSessionId();
	chat.setSessionId(sessionId);
	activeProbe = probe;
	try {
		for (let i = 0; i < HISTORY_PROBE_SCENARIO.length; i++) {
			if (probe.aborted) {
				break;
			}
			const prompt = HISTORY_PROBE_SCENARIO[i];
			channel.append(`> tour ${i + 1} : ${prompt}\n`);
			const params = settings.buildAgentRunParams({
				prompt,
				workspace,
				mode: settings.getPermissionMode(),
				sessionId,
			});
			params.historyProbe = true;
			const started = await engine.request('agent.run', params) as { runId?: string };
			const runId = started?.runId;
			probe.runId = runId;
			turns.push({ index: i + 1, prompt, runId });
			if (probe.aborted) {
				if (runId) {
					void engine.request('agent.cancel', { runId }).catch(() => undefined);
				}
				break;
			}
			if (!runId) {
				channel.append('agent.run n\'a pas renvoyé de runId\n');
				break;
			}
			chat.setRunId(runId);
			chat.beginSessionRun(sessionId, runId);
			try {
				await waitForRunDone(probe, runId);
			} finally {
				chat.endSessionRun(sessionId, runId);
				if (chat.getRunId() === runId) {
					chat.setRunId(undefined);
				}
			}
		}
		channel.append(probe.aborted ? 'sonde interrompue\n' : 'sonde terminée\n');
	} catch (err) {
		error = err instanceof Error ? err.message : String(err);
		channel.append(`erreur : ${error}\n`);
	} finally {
		listener.dispose();
		const report = {
			tool: 'history-probe',
			sessionId,
			profile: llm.engineProfile,
			model: llm.model,
			provider: llm.llmProvider,
			workspace,
			finishedAt: new Date().toISOString(),
			turns,
			calls,
			aborted: probe.aborted,
			error: error ?? null,
		};
		const dir = join(dirname(workspace), HISTORY_PROBE_RESULTS_DIR);
		const latest = URI.file(join(dir, 'latest.json'));
		const stamped = URI.file(join(dir, `${sessionId}.json`));
		const body = VSBuffer.fromString(JSON.stringify(report, null, 2));
		await files.createFolder(URI.file(dir));
		await files.writeFile(latest, body);
		await files.writeFile(stamped, body);
		channel.append(`export ${latest.fsPath}\n`);
		if (activeProbe === probe) {
			activeProbe = undefined;
		}
		if (chat.getSessionId() === sessionId) {
			chat.setSessionId(previousSessionId);
		}
		if (chat.getRunId() && probe.runId && chat.getRunId() === probe.runId) {
			chat.setRunId(undefined);
		}
	}
}

function waitForRunDone(probe: ProbeControl, runId: string): Promise<void> {
	return new Promise(resolve => {
		let settled = false;
		const finish = () => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timer);
			sub.dispose();
			resolve();
		};
		if (probe.aborted) {
			resolve();
			return;
		}
		probe.wake.push(finish);
		const timer = setTimeout(finish, 900_000);
		const sub = probe.engine.onNotification(payload => {
			if (payload.method !== 'agent/done') {
				return;
			}
			const params = payload.params as { runId?: string; run_id?: string } | undefined;
			const id = params?.runId ?? params?.run_id;
			if (id === runId) {
				finish();
			}
		});
	});
}

registerWorkbenchContribution2(
	DroxHistoryProbeContribution.ID,
	DroxHistoryProbeContribution,
	WorkbenchPhase.Eventually,
);
