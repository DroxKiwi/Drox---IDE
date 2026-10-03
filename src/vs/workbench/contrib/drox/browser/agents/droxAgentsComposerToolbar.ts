/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import './media/droxAgentsComposerToolbar.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { droxConfigChangeAffectsArchitectSettings, droxConfigChangeAffectsGeneralSettings } from '../../common/droxChatConfigSync.js';
import { DroxSetting } from '../../common/droxConfiguration.js';
import { formatDroxNumCtxLabel } from '../../common/droxNumCtx.js';
import { readDroxChatConfigurationValue } from '../../common/droxAgentsConfiguration.js';
import { IDroxCodebaseContextService } from '../../common/codebase/droxCodebaseContextService.js';
import { IDroxCodebaseSupervisionService } from '../../common/codebase/droxCodebaseSupervisionService.js';
import { DroxCodebaseIndexState } from '../../common/codebase/droxCodebaseTypes.js';
import { readDroxGeneralSettingsForWebview } from '../chat/droxChatGeneralSettings.js';
import { openDroxCodebaseCockpit, openDroxRegulationView } from '../droxOpenWorkbenchViews.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import {
	createCodebaseForcePickerChip,
	createCodebaseStatusPickerChip,
	createModelSettingsPickerChip,
	createRegulationPickerChip,
	createServerSettingsPickerChip,
} from './droxAgentsPanelPickerChip.js';
import { DroxAgentsPermissionModePicker } from './droxAgentsPermissionModePicker.js';
import { IDroxAgentsComposerDroxChatHost } from './droxAgentsComposerDroxChatHost.js';

const $ = dom.$;

export class DroxAgentsComposerToolbar extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _modelSettingsChip: ReturnType<typeof createModelSettingsPickerChip>;
	private readonly _serverSettingsChip: ReturnType<typeof createServerSettingsPickerChip>;
	private readonly _codebaseChip: ReturnType<typeof createCodebaseStatusPickerChip>;
	private readonly _codebaseForceChip: ReturnType<typeof createCodebaseForcePickerChip>;
	private readonly _regulationChip: ReturnType<typeof createRegulationPickerChip>;
	private readonly _permissionModePicker: DroxAgentsPermissionModePicker;
	private readonly _chipDisposables = this._register(new DisposableStore());

	constructor(
		@IDroxAgentsComposerDroxChatHost private readonly composerHost: IDroxAgentsComposerDroxChatHost,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,
		@IDroxCodebaseSupervisionService private readonly codebaseSupervision: IDroxCodebaseSupervisionService,
		@IDroxCodebaseContextService private readonly codebaseContext: IDroxCodebaseContextService,
		@IViewsService private readonly viewsService: IViewsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		const modelSettingsLabel = localize('droxAgents.modelSettings', 'Model settings');
		const serverSettingsLabel = localize('droxAgents.serverSettings', 'Server');

		this._modelSettingsChip = createModelSettingsPickerChip(
			modelSettingsLabel,
			localize('droxAgents.modelSettingsTitle', 'Model parameters (context window, sampling, output)'),
		);
		this._serverSettingsChip = createServerSettingsPickerChip(
			serverSettingsLabel,
			localize('droxAgents.serverSettingsTitle', 'Server and agent behavior'),
		);
		this._codebaseChip = createCodebaseStatusPickerChip(
			localize('droxAgents.codebaseChip', 'Codebase'),
			localize('droxAgents.codebaseChipTitle', 'Open @Codebase cockpit (index status)'),
		);
		this._codebaseForceChip = createCodebaseForcePickerChip(
			localize('droxAgents.codebaseForceAuto', 'Auto'),
			localize('droxAgents.codebaseForceTitle', 'Force wider @Codebase inject on the next send'),
		);
		this._regulationChip = createRegulationPickerChip(
			localize('droxAgents.regulationChip', 'Regulation'),
			localize('droxAgents.regulationChipTitle', 'Open model regulation observatory'),
		);
		this._permissionModePicker = this._register(instantiationService.createInstance(DroxAgentsPermissionModePicker));

		this.domNode = $('.drox-agents-composer-toolbar');
		this.domNode.setAttribute('role', 'group');
		this.domNode.setAttribute('aria-label', localize('droxAgents.composerToolbar', 'Drox composer controls'));

		this._chipDisposables.add(this._modelSettingsChip);
		this._chipDisposables.add(this._serverSettingsChip);
		this._chipDisposables.add(this._codebaseChip);
		this._chipDisposables.add(this._codebaseForceChip);
		this._chipDisposables.add(this._regulationChip);
		this._modelSettingsChip.render(this.domNode);
		this._serverSettingsChip.render(this.domNode);
		this._codebaseChip.render(this.domNode);
		this._codebaseForceChip.render(this.domNode);
		this._regulationChip.render(this.domNode);
		this._permissionModePicker.render(this.domNode);

		this._chipDisposables.add(this._modelSettingsChip.onDidClick(() => {
			void this.composerHost.toggleModelSettingsPanel();
		}));
		this._chipDisposables.add(this._serverSettingsChip.onDidClick(() => {
			void this.composerHost.toggleServerSettingsPanel();
		}));
		this._chipDisposables.add(this._codebaseChip.onDidClick(() => {
			void openDroxCodebaseCockpit({
				viewsService: this.viewsService,
				layoutService: this.layoutService,
				environmentService: this.environmentService,
			});
		}));
		this._chipDisposables.add(this._codebaseForceChip.onDidClick(() => {
			this.codebaseContext.toggleForceNextRun();
		}));
		this._chipDisposables.add(this._regulationChip.onDidClick(() => {
			void openDroxRegulationView({
				viewsService: this.viewsService,
				layoutService: this.layoutService,
				environmentService: this.environmentService,
			});
		}));

		this._register(this.composerHost.attachToolbarRoot(this.domNode));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (droxConfigChangeAffectsArchitectSettings(e) || droxConfigChangeAffectsGeneralSettings(e)) {
				this._syncChipLabels();
			}
			if (e.affectsConfiguration(DroxSetting.CodebaseAutoInject)) {
				this._syncCodebaseForceChip();
			}
		}));
		this._register(this.codebaseSupervision.onDidChangeSnapshot(() => this._syncCodebaseChip()));
		this._register(this.codebaseContext.onDidChangeForceNext(() => this._syncCodebaseForceChip()));

		this._register(this.composerHost.onDidReconcileToolbarUi(() => {
			this._syncChipUi();
			this._syncChipLabels();
		}));
		this._syncChipUi();
		this._syncChipLabels();
		this._syncCodebaseChip();
		this._syncCodebaseForceChip();
	}

	private _syncCodebaseChip(): void {
		const s = this.codebaseSupervision.snapshot;
		const label = this._codebaseLabel(s.state, s.storage.files, s.mode);
		this._codebaseChip.setLabel(label);
		const trigger = this._codebaseChip.triggerElement;
		trigger.classList.toggle('is-indexing', s.state === 'indexing');
		trigger.classList.toggle('is-error', s.state === 'error');
		trigger.classList.toggle('is-paused', s.state === 'paused');
		trigger.classList.toggle('is-missing', s.state === 'missing' || s.storage.chunks === 0);
		trigger.classList.toggle('is-ready', s.state === 'idle' && s.storage.chunks > 0);
		const tip = [
			localize('droxAgents.codebaseChipTitle', 'Open @Codebase cockpit (index status)'),
			localize('droxAgents.codebaseChipState', 'State: {0}', s.state),
			s.mode ? localize('droxAgents.codebaseChipMode', 'Mode: {0}', s.mode) : '',
			s.storage.chunks
				? localize('droxAgents.codebaseChipStats', '{0} files · {1} chunks · {2} vectors', String(s.storage.files), String(s.storage.chunks), String(s.storage.vectors))
				: localize('droxAgents.codebaseChipEmpty', 'No index yet'),
		].filter(Boolean).join('\n');
		trigger.title = tip;
	}

	private _syncCodebaseForceChip(): void {
		const forced = this.codebaseContext.forceNextRun;
		const autoOn = this.codebaseContext.isAutoInjectEnabled();
		const label = forced
			? localize('droxAgents.codebaseForceOn', 'Forced')
			: autoOn
				? localize('droxAgents.codebaseForceAuto', 'Auto')
				: localize('droxAgents.codebaseForceOff', 'Off');
		this._codebaseForceChip.setLabel(label);
		const trigger = this._codebaseForceChip.triggerElement;
		trigger.classList.toggle('is-forced', forced);
		trigger.classList.toggle('is-auto-off', !autoOn && !forced);
		trigger.title = forced
			? localize('droxAgents.codebaseForceTitleArmed', 'Wider @Codebase inject armed for the next send (click to cancel)')
			: localize('droxAgents.codebaseForceTitle', 'Force wider @Codebase inject on the next send');
	}

	private _codebaseLabel(
		state: DroxCodebaseIndexState,
		files: number,
		mode: string,
	): string {
		switch (state) {
			case 'indexing':
				return localize('droxAgents.codebaseIndexing', 'Indexing…');
			case 'error':
				return localize('droxAgents.codebaseError', 'Index error');
			case 'paused':
				return localize('droxAgents.codebasePaused', 'Paused');
			case 'missing':
				return localize('droxAgents.codebaseMissing', 'No index');
			case 'idle':
			default:
				if (!files) {
					return localize('droxAgents.codebaseMissing', 'No index');
				}
				return mode === 'hybrid'
					? localize('droxAgents.codebaseHybrid', 'Hybrid')
					: localize('droxAgents.codebaseLexical', 'Lexical');
		}
	}

	private _syncChipLabels(): void {
		const numCtx = readDroxChatConfigurationValue<number>(this.configurationService, DroxSetting.NumCtx);
		if (typeof numCtx === 'number' && Number.isFinite(numCtx)) {
			this._modelSettingsChip.setLabel(formatDroxNumCtxLabel(numCtx));
		} else {
			this._modelSettingsChip.setLabel(localize('droxAgents.modelSettings', 'Model settings'));
		}

		const settings = readDroxGeneralSettingsForWebview({
			configurationService: this.configurationService,
			runSettingsService: this.runSettingsService,
		});
		const summary = settings.connectionSummary?.trim();
		if (summary) {
			const short = summary.length > 24 ? `${summary.slice(0, 22)}…` : summary;
			this._serverSettingsChip.setLabel(short);
		} else if (!settings.server?.trim()) {
			this._serverSettingsChip.setLabel(localize('droxAgents.serverNotConfigured', 'Connect'));
		} else {
			const host = settings.server.replace(/^https?:\/\//, '');
			this._serverSettingsChip.setLabel(host.length > 20 ? `${host.slice(0, 18)}…` : host);
		}
	}

	private _syncChipUi(): void {
		const state = this.composerHost.getToolbarUiState();
		this._modelSettingsChip.setPanelOpen(state.modelSettingsPanelOpen);
		this._serverSettingsChip.setPanelOpen(state.serverSettingsPanelOpen);
		this._modelSettingsChip.setConnectionBlocked(state.modelSettingsBlocked);
		this._serverSettingsChip.setConnectionAttention(state.serverSettingsNeedsAttention);
		const bootstrapLoading = state.panelBootstrapLoading;
		this._modelSettingsChip.setLoading(bootstrapLoading);
		this._serverSettingsChip.setLoading(bootstrapLoading);
	}
}
