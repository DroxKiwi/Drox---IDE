/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import './media/droxAgentsComposerToolbar.css';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { DROX_TOKEN_WARNING_HOVER_CLASS, droxTokenWarningHoverContent } from '../../../../browser/droxTokenWarningHover.js';
import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { droxConfigChangeAffectsArchitectSettings, droxConfigChangeAffectsGeneralSettings } from '../../common/droxChatConfigSync.js';
import { DroxSetting } from '../../common/droxConfiguration.js';
import { formatDroxNumCtxLabel } from '../../common/droxNumCtx.js';
import { readDroxChatConfigurationValue } from '../../common/droxAgentsConfiguration.js';
import { IDroxCodebaseContextService } from '../../common/codebase/droxCodebaseContextService.js';
import { readDroxGeneralSettingsForWebview } from '../chat/droxChatGeneralSettings.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import {
	createCodebaseForcePickerChip,
	createModelSettingsPickerChip,
	createAutoAlignPickerChip,
	createServerSettingsPickerChip,
} from './droxAgentsPanelPickerChip.js';
import { IDroxSdtcmService } from '../sdtcm/droxSdtcmService.js';
import { DroxAgentsPermissionModePicker } from './droxAgentsPermissionModePicker.js';
import { IDroxAgentsComposerDroxChatHost } from './droxAgentsComposerDroxChatHost.js';

const $ = dom.$;

export class DroxAgentsComposerToolbar extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _modelSettingsChip: ReturnType<typeof createModelSettingsPickerChip>;
	private readonly _serverSettingsChip: ReturnType<typeof createServerSettingsPickerChip>;
	private readonly _codebaseForceChip: ReturnType<typeof createCodebaseForcePickerChip>;
	private readonly _alignChip: ReturnType<typeof createAutoAlignPickerChip>;
	private readonly _permissionModePicker: DroxAgentsPermissionModePicker;
	private readonly _chipDisposables = this._register(new DisposableStore());

	constructor(
		@IDroxAgentsComposerDroxChatHost private readonly composerHost: IDroxAgentsComposerDroxChatHost,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,
		@IDroxCodebaseContextService private readonly codebaseContext: IDroxCodebaseContextService,
		@IDroxSdtcmService private readonly sdtcmService: IDroxSdtcmService,
		@IHoverService hoverService: IHoverService,
	) {
		super();

		const modelSettingsLabel = localize('droxAgents.modelSettings', 'Model settings');
		const serverSettingsLabel = localize('droxAgents.serverSettings', 'Server');

		this._modelSettingsChip = createModelSettingsPickerChip(
			modelSettingsLabel,
			localize('droxAgents.modelSettingsTitle', 'Model parameters (context window, max iterations, sampling, output)'),
		);
		this._serverSettingsChip = createServerSettingsPickerChip(
			serverSettingsLabel,
			localize('droxAgents.serverSettingsTitle', 'Server and agent behavior'),
		);
		this._codebaseForceChip = createCodebaseForcePickerChip(
			localize('droxAgents.codebaseForceAuto', 'Auto'),
			localize('droxAgents.codebaseForceTitle', 'Force wider @Codebase inject on the next send'),
		);
		const alignWarning = localize('droxAgents.autoAlignChipTitle', 'The selected model is called to build and update the map. This spends tokens.');
		this._alignChip = createAutoAlignPickerChip(
			localize('droxAgents.autoAlignChip', 'SDTCM Align'),
			alignWarning,
		);
		this._permissionModePicker = this._register(instantiationService.createInstance(DroxAgentsPermissionModePicker));

		this.domNode = $('.drox-agents-composer-toolbar');
		this.domNode.setAttribute('role', 'group');
		this.domNode.setAttribute('aria-label', localize('droxAgents.composerToolbar', 'Drox composer controls'));

		this._chipDisposables.add(this._modelSettingsChip);
		this._chipDisposables.add(this._serverSettingsChip);
		this._chipDisposables.add(this._codebaseForceChip);
		this._chipDisposables.add(this._alignChip);
		this._modelSettingsChip.render(this.domNode);
		this._serverSettingsChip.render(this.domNode);
		this._codebaseForceChip.render(this.domNode);
		this._alignChip.render(this.domNode);
		this._alignChip.triggerElement.removeAttribute('title');
		this._register(hoverService.setupDelayedHover(this._alignChip.triggerElement, () => ({
			content: droxTokenWarningHoverContent(alignWarning),
			additionalClasses: [DROX_TOKEN_WARNING_HOVER_CLASS],
			style: HoverStyle.Pointer,
			appearance: { compact: false, showPointer: true },
			position: { hoverPosition: HoverPosition.ABOVE },
		})));
		this._permissionModePicker.render(this.domNode);

		this._chipDisposables.add(this._modelSettingsChip.onDidClick(() => {
			void this.composerHost.toggleModelSettingsPanel();
		}));
		this._chipDisposables.add(this._serverSettingsChip.onDidClick(() => {
			void this.composerHost.toggleServerSettingsPanel();
		}));
		this._chipDisposables.add(this._codebaseForceChip.onDidClick(() => {
			this.codebaseContext.toggleForceNextRun();
		}));
		this._chipDisposables.add(this._alignChip.onDidClick(() => {
			this.sdtcmService.setAutoAlign(!this.sdtcmService.getAutoAlign());
		}));
		this._register(this.sdtcmService.onDidChangeAutoAlign(() => this._syncAlignChip()));

		this._register(this.composerHost.attachToolbarRoot(this.domNode));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (droxConfigChangeAffectsArchitectSettings(e) || droxConfigChangeAffectsGeneralSettings(e)) {
				this._syncChipLabels();
			}
			if (e.affectsConfiguration(DroxSetting.CodebaseAutoInject)) {
				this._syncCodebaseForceChip();
			}
		}));
		this._register(this.codebaseContext.onDidChangeForceNext(() => this._syncCodebaseForceChip()));
		this._register(this.sdtcmService.onDidChange(() => this._syncAlignChip()));

		this._register(this.composerHost.onDidReconcileToolbarUi(() => {
			this._syncChipUi();
			this._syncChipLabels();
		}));
		this._syncChipUi();
		this._syncChipLabels();
		this._syncCodebaseForceChip();
		this._syncAlignChip();
	}

	private _syncAlignChip(): void {
		const on = this.sdtcmService.getAutoAlign();
		const snap = this.sdtcmService.getSnapshot();
		const running = snap.phase === 'running';
		const progress = snap.progress || '0%';
		this._alignChip.setLabel(running
			? localize('droxAgents.autoAlignProgress', 'SDTCM {0}', progress)
			: on
				? localize('droxAgents.autoAlignOn', 'SDTCM Align on')
				: localize('droxAgents.autoAlignChip', 'SDTCM Align'));
		const trigger = this._alignChip.triggerElement;
		trigger.classList.toggle('panel-open', on);
		trigger.classList.toggle('sdtcm-running', running);
		trigger.setAttribute('aria-pressed', on ? 'true' : 'false');
		trigger.setAttribute('aria-busy', running ? 'true' : 'false');
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
		if (!settings.server?.trim() || !summary || summary === 'Not configured') {
			this._serverSettingsChip.setLabel(localize('droxAgents.serverNotConfigured', 'Connect'));
		} else {
			const short = summary.length > 24 ? `${summary.slice(0, 22)}…` : summary;
			const maxIter = settings.maxIterations;
			this._serverSettingsChip.setLabel(
				typeof maxIter === 'number' && Number.isFinite(maxIter) && maxIter > 0
					? `${short} · ×${Math.floor(maxIter)}`
					: short,
			);
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
