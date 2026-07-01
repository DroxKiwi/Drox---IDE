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
import { droxConfigChangeAffectsArchitectSettings, droxConfigChangeAffectsGeneralSettings } from '../../common/droxChatConfigSync.js';
import { DroxSetting } from '../../common/droxConfiguration.js';
import { formatDroxNumCtxLabel } from '../../common/droxNumCtx.js';
import { readDroxChatConfigurationValue } from '../../common/droxAgentsConfiguration.js';
import { readDroxGeneralSettingsForWebview } from '../chat/droxChatGeneralSettings.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { createModelSettingsPickerChip, createServerSettingsPickerChip } from './droxAgentsPanelPickerChip.js';
import { DroxAgentsPermissionModePicker } from './droxAgentsPermissionModePicker.js';
import { IDroxAgentsComposerDroxChatHost } from './droxAgentsComposerDroxChatHost.js';

const $ = dom.$;

export class DroxAgentsComposerToolbar extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _modelSettingsChip: ReturnType<typeof createModelSettingsPickerChip>;
	private readonly _serverSettingsChip: ReturnType<typeof createServerSettingsPickerChip>;
	private readonly _permissionModePicker: DroxAgentsPermissionModePicker;
	private readonly _chipDisposables = this._register(new DisposableStore());

	constructor(
		@IDroxAgentsComposerDroxChatHost private readonly composerHost: IDroxAgentsComposerDroxChatHost,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,
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
		this._permissionModePicker = this._register(instantiationService.createInstance(DroxAgentsPermissionModePicker));

		this.domNode = $('.drox-agents-composer-toolbar');
		this.domNode.setAttribute('role', 'group');
		this.domNode.setAttribute('aria-label', localize('droxAgents.composerToolbar', 'Drox composer controls'));

		this._chipDisposables.add(this._modelSettingsChip);
		this._chipDisposables.add(this._serverSettingsChip);
		this._modelSettingsChip.render(this.domNode);
		this._serverSettingsChip.render(this.domNode);
		this._permissionModePicker.render(this.domNode);

		this._chipDisposables.add(this._modelSettingsChip.onDidClick(() => {
			void this.composerHost.toggleModelSettingsPanel();
		}));
		this._chipDisposables.add(this._serverSettingsChip.onDidClick(() => {
			void this.composerHost.toggleServerSettingsPanel();
		}));

		this._register(this.composerHost.attachToolbarRoot(this.domNode));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (droxConfigChangeAffectsArchitectSettings(e) || droxConfigChangeAffectsGeneralSettings(e)) {
				this._syncChipLabels();
			}
		}));

		this._register(this.composerHost.onDidReconcileToolbarUi(() => {
			this._syncChipUi();
			this._syncChipLabels();
		}));
		this._syncChipUi();
		this._syncChipLabels();
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
	}
}
