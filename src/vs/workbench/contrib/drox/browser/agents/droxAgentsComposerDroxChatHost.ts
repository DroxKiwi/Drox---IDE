/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { mainWindow } from '../../../../../base/browser/window.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { DroxCommands } from '../../common/drox.js';
import { setDroxPermissionModeConfiguration } from '../../common/droxAgentsConfiguration.js';
import { droxConfigChangeAffectsArchitectSettings, droxConfigChangeAffectsGeneralSettings, droxConfigChangeAffectsPermissionMode } from '../../common/droxChatConfigSync.js';
import { resolveDroxPermissionMode, getProfessorModeRemovedNotificationMessage } from '../../common/droxPermissionAsk.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';
import { IDroxLlmModelsService } from '../../common/droxLlmModelsService.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { DroxHostToWebviewMessage, DroxWebviewToHostMessage } from '../droxChatBridge.js';
import {
	postConnectionTestResult,
	testDroxLlmConnectionDraft,
} from '../chat/droxChatConnectionTest.js';
import { IDroxGeneralSettingsPatch, pushGeneralSettingsToWebview, setDroxGeneralSettingsFromWebview } from '../chat/droxChatGeneralSettings.js';
import { refreshDroxChatLlmModels } from '../chat/droxChatLlmModels.js';
import { setDroxArchitectLlmParamsFromWebview, setDroxArchitectModelFromWebview } from '../chat/droxChatRoleModels.js';
import { buildDroxComposerPanelsMarkup } from './droxComposerMarkup.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { installDroxChatTrustedDomOverrides, setDroxAgentsComposerInnerHtml, toDroxAgentsComposerTrustedScriptUrl } from './droxAgentsComposerDom.js';
import './media/droxAgentsComposerPanelChrome.css';
import './media/droxAgentsComposerPanels.css';

export const IDroxAgentsComposerDroxChatHost = createDecorator<IDroxAgentsComposerDroxChatHost>('droxAgentsComposerDroxChatHost');

export interface IDroxAgentsComposerToolbarUiState {
	readonly modelSettingsPanelOpen: boolean;
	readonly serverSettingsPanelOpen: boolean;
	readonly modelSettingsBlocked: boolean;
	readonly serverSettingsNeedsAttention: boolean;
	readonly panelBootstrapLoading: boolean;
}

export interface IDroxAgentsComposerDroxChatHost {
	readonly _serviceBrand: undefined;
	readonly onDidReconcileToolbarUi: Event<void>;
	attachToolbarRoot(root: HTMLElement): IDisposable;
	/** @deprecated Utiliser {@link attachToolbarRoot}. */
	attachVignettesRoot(root: HTMLElement): IDisposable;
	getToolbarUiState(): IDroxAgentsComposerToolbarUiState;
	toggleModelSettingsPanel(): Promise<void>;
	toggleServerSettingsPanel(): Promise<void>;
	/** Resync panneaux composer depuis la config USER (ex. autre fenêtre IDE / Agents). */
	reconcileFromConfiguration(): Promise<void>;
}

interface IDroxChatGlobal {
	dom: Record<string, HTMLElement | null | undefined>;
	state: Record<string, unknown>;
	const: Record<string, unknown>;
	fn: Record<string, (...args: unknown[]) => unknown>;
	vscode: { postMessage: (msg: unknown) => void };
}

const COMPOSER_DROX_CHAT_SCRIPTS = [
	'droxChat/core/00-bootstrap.js',
	'droxChat/core/inner-html.js',
	'droxChat/core/constants-modes.js',
	'droxChat/core/constants-num-ctx.js',
	'droxChat/core/state.js',
	'droxChat/settings/01-prompt.js',
	'droxChat/settings/01b-models.js',
	'droxChat/settings/role-models/state.js',
	'droxChat/settings/role-models/helpers.js',
	'droxChat/settings/role-models/num-ctx.js',
	'droxChat/settings/role-models/panel.js',
	'droxChat/settings/role-models/mute.js',
	'droxChat/settings/role-models/persist.js',
	'droxChat/settings/role-models/host-sync.js',
	'droxChat/settings/role-models/init.js',
	'droxChat/settings/general-settings/state.js',
	'droxChat/settings/general-settings/chat-issues.js',
	'droxChat/settings/general-settings/connection-catalog.js',
	'droxChat/settings/general-settings/connection-wizard.js',
	'droxChat/settings/general-settings/helpers.js',
	'droxChat/settings/general-settings/panel.js',
	'droxChat/settings/general-settings/host-sync.js',
	'droxChat/settings/general-settings/init.js',
	'droxChat/bridge/host-message.js',
] as const;

class ComposerHostAdapter {
	constructor(private readonly _post: (message: DroxHostToWebviewMessage) => void) { }
	post(message: DroxHostToWebviewMessage): void {
		this._post(message);
	}
}

export class DroxAgentsComposerDroxChatHost extends Disposable implements IDroxAgentsComposerDroxChatHost {

	declare readonly _serviceBrand: undefined;

	private static _initPromise: Promise<void> | undefined;
	private static _panelsRoot: HTMLElement | undefined;
	private static _panelBootstrapLoading = false;

	private readonly _hostAdapter: ComposerHostAdapter;
	private readonly _toolbarRoots = new Set<HTMLElement>();
	private readonly _wiredToolbarRoots = new WeakSet<HTMLElement>();
	private readonly _onDidReconcileToolbarUi = this._register(new Emitter<void>());
	readonly onDidReconcileToolbarUi = this._onDidReconcileToolbarUi.event;
	private _handlersInitialized = false;
	private _panelShellInitialized = false;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,
		@IDroxLlmModelsService private readonly llmModelsService: IDroxLlmModelsService,
		@IDroxEngineService private readonly droxEngineService: IDroxEngineService,
		@IRequestService private readonly requestService: IRequestService,
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@ICommandService private readonly commandService: ICommandService,
		@IHostService private readonly hostService: IHostService,
	) {
		super();
		this._hostAdapter = new ComposerHostAdapter(message => this._handleHostMessage(message));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (droxConfigChangeAffectsPermissionMode(e)) {
				void this._pushPermissionModeFromConfiguration();
			}
			if (droxConfigChangeAffectsGeneralSettings(e)) {
				void this._ensureReady().then(() => {
					pushGeneralSettingsToWebview(this._hostAdapter, this.runSettingsService, this.configurationService);
				});
			}
			if (droxConfigChangeAffectsArchitectSettings(e)) {
				void this._ensureReady().then(() =>
					refreshDroxChatLlmModels(this._hostAdapter, this.llmModelsService, this.runSettingsService, this.configurationService),
				);
			}
		}));
		this._register(this.hostService.onDidChangeFocus(focus => {
			if (!focus) {
				return;
			}
			void this.reconcileFromConfiguration().catch(err => onUnexpectedError(err));
		}));
	}

	async reconcileFromConfiguration(): Promise<void> {
		await this._syncFromConfiguration();
	}

	attachToolbarRoot(root: HTMLElement): IDisposable {
		this._toolbarRoots.add(root);
		this._wireToolbarClicks(root);
		void this._ensureReady().then(() => {
			this._bindDomFromVisibleRoot();
			this._ensureHandlers();
			void this._syncFromConfiguration();
		}).catch(err => onUnexpectedError(err));
		return {
			dispose: () => {
				this._toolbarRoots.delete(root);
				this._bindDomFromVisibleRoot();
			},
		};
	}

	attachVignettesRoot(root: HTMLElement): IDisposable {
		return this.attachToolbarRoot(root);
	}

	getToolbarUiState(): IDroxAgentsComposerToolbarUiState {
		try {
			const D = this._drox();
			const fn = D.fn;
			const rolePanel = D.dom.roleModelPanelEl;
			const settingsPanel = D.dom.generalSettingsPanelEl;
			const modelSettingsPanelOpen = D.state.rolePanelOpen === 'architect' && Boolean(rolePanel && !rolePanel.hidden);
			const serverSettingsPanelOpen = Boolean(D.state.generalSettingsPanelOpen) && Boolean(settingsPanel && !settingsPanel.hidden);
			const configured = typeof fn.isConnectionConfigured === 'function' && fn.isConnectionConfigured();
			const wizardOpen = Boolean((D.state.connectionWizard as { open?: boolean } | undefined)?.open);
			const busy = Boolean(D.state.busy);
			return {
				modelSettingsPanelOpen,
				serverSettingsPanelOpen,
				modelSettingsBlocked: !configured,
				serverSettingsNeedsAttention: !configured && !wizardOpen && !busy && !serverSettingsPanelOpen,
				panelBootstrapLoading: DroxAgentsComposerDroxChatHost._panelBootstrapLoading,
			};
		} catch {
			return {
				modelSettingsPanelOpen: false,
				serverSettingsPanelOpen: false,
				modelSettingsBlocked: false,
				serverSettingsNeedsAttention: false,
				panelBootstrapLoading: DroxAgentsComposerDroxChatHost._panelBootstrapLoading,
			};
		}
	}

	async toggleModelSettingsPanel(): Promise<void> {
		try {
			await this._ensureReady();
			this._bindDomFromVisibleRoot();
			const fn = this._drox().fn;
			if (typeof fn.isArchitectVignetteBlocked === 'function' && fn.isArchitectVignetteBlocked()) {
				if (typeof fn.redirectToConnectionSetup === 'function') {
					fn.redirectToConnectionSetup();
				}
				this._reconcileToolbarUi();
				return;
			}
			if (typeof fn.toggleRoleModelPanel === 'function') {
				fn.toggleRoleModelPanel();
			} else if (typeof fn.openRoleModelPanel === 'function') {
				fn.openRoleModelPanel();
			}
			this._reconcileToolbarUi();
		} catch (err) {
			onUnexpectedError(err);
		}
	}

	async toggleServerSettingsPanel(): Promise<void> {
		try {
			await this._ensureReady();
			this._bindDomFromVisibleRoot();
			const fn = this._drox().fn;
			if (typeof fn.toggleGeneralSettingsPanel === 'function') {
				fn.toggleGeneralSettingsPanel();
			} else if (typeof fn.openGeneralSettingsPanel === 'function') {
				fn.openGeneralSettingsPanel();
			}
			this._reconcileToolbarUi();
		} catch (err) {
			onUnexpectedError(err);
		}
	}

	private _drox(): IDroxChatGlobal {
		return (globalThis as { DroxChat?: IDroxChatGlobal }).DroxChat as IDroxChatGlobal;
	}

	private async _ensureReady(): Promise<void> {
		if (!DroxAgentsComposerDroxChatHost._initPromise) {
			this._setPanelBootstrapLoading(true);
			DroxAgentsComposerDroxChatHost._initPromise = this._bootstrap()
				.catch(err => {
					DroxAgentsComposerDroxChatHost._initPromise = undefined;
					throw err;
				})
				.finally(() => {
					this._setPanelBootstrapLoading(false);
				});
		}
		return DroxAgentsComposerDroxChatHost._initPromise;
	}

	private _setPanelBootstrapLoading(loading: boolean): void {
		if (DroxAgentsComposerDroxChatHost._panelBootstrapLoading === loading) {
			return;
		}
		DroxAgentsComposerDroxChatHost._panelBootstrapLoading = loading;
		this._onDidReconcileToolbarUi.fire();
	}

	private async _bootstrap(): Promise<void> {
		this._ensureDroxChatGlobal();
		this._mountPanels();
		await this._loadScripts();
		this._patchPanelPositioning();
		this._bindDomFromVisibleRoot();
		this._initGeneralSettingsPanelShell();
	}

	private _initGeneralSettingsPanelShell(): void {
		if (this._panelShellInitialized) {
			return;
		}
		const fn = this._drox().fn;
		if (typeof fn.initGeneralSettingsPanelShell === 'function') {
			fn.initGeneralSettingsPanelShell();
			this._panelShellInitialized = true;
		}
	}

	private _ensureHandlers(): void {
		this._bindDomFromVisibleRoot();
		this._initGeneralSettingsPanelShell();
		const hasToolbarTriggers = Boolean(
			this._visibleToolbarRoot()?.querySelector('#architect-model-vignette, #general-settings-vignette'),
		);
		if (!this._drox().dom.generalSettingsVignetteEl && !this._drox().dom.architectModelVignetteEl && !hasToolbarTriggers) {
			return;
		}
		if (this._handlersInitialized) {
			return;
		}
		this._initHandlers();
		this._handlersInitialized = true;
	}

	private _wireToolbarClicks(root: HTMLElement): void {
		if (this._wiredToolbarRoots.has(root)) {
			return;
		}
		this._wiredToolbarRoots.add(root);
		root.addEventListener('click', (e) => {
			const target = e.target;
			if (!(target instanceof Element)) {
				return;
			}
			const btn = target.closest<HTMLElement>('.drox-agents-panel-picker-trigger, .agent-vignette');
			if (!btn || !root.contains(btn)) {
				return;
			}
			if (btn.classList.contains('drox-agents-panel-picker-trigger') || btn.id === 'general-settings-vignette' || btn.id === 'architect-model-vignette') {
				e.preventDefault();
				e.stopPropagation();
				void this._onPanelPickerClick(btn);
			}
		});
	}

	private async _onPanelPickerClick(btn: HTMLElement): Promise<void> {
		try {
			await this._ensureReady();
			this._bindDomFromVisibleRoot();
			const fn = this._drox().fn;
			if (btn.id === 'general-settings-vignette') {
				if (typeof fn.toggleGeneralSettingsPanel === 'function') {
					fn.toggleGeneralSettingsPanel();
				}
				this._reconcileToolbarUi();
				return;
			}
			if (btn.id === 'architect-model-vignette') {
				if (typeof fn.isArchitectVignetteBlocked === 'function' && fn.isArchitectVignetteBlocked()) {
					if (typeof fn.redirectToConnectionSetup === 'function') {
						fn.redirectToConnectionSetup();
					}
					this._reconcileToolbarUi();
					return;
				}
				try {
					if (typeof fn.toggleRoleModelPanel === 'function') {
						fn.toggleRoleModelPanel();
					}
				} catch (roleErr) {
					this._resetArchitectPanelUi();
					throw roleErr;
				}
				this._reconcileToolbarUi();
			}
		} catch (err) {
			onUnexpectedError(err);
		}
	}

	private _ensureDroxChatGlobal(): void {
		const g = globalThis as { DroxChat?: IDroxChatGlobal; acquireVsCodeApi?: () => { postMessage: (msg: unknown) => void } };
		if (!g.DroxChat) {
			g.DroxChat = { dom: {}, state: {}, const: {}, fn: {}, vscode: { postMessage: () => { } } };
		} else {
			g.DroxChat.dom ??= {};
			g.DroxChat.state ??= {};
			g.DroxChat.const ??= {};
			g.DroxChat.fn ??= {};
		}
		g.acquireVsCodeApi = () => ({
			postMessage: (msg: unknown) => {
				void this._routeWebviewMessage(msg as DroxWebviewToHostMessage);
			},
		});
	}

	private _resetArchitectPanelUi(): void {
		const D = this._drox();
		const vignette = D.dom.architectModelVignetteEl;
		if (vignette) {
			vignette.classList.remove('panel-open');
			vignette.setAttribute('aria-expanded', 'false');
		}
		const panel = D.dom.roleModelPanelEl;
		if (panel) {
			panel.hidden = true;
		}
		D.state.rolePanelOpen = null;
		this._reconcileToolbarUi();
	}

	/** État visuel toolbar Agents — pas de panel-open / focus / blocked fantômes. */
	private _reconcileToolbarUi(): void {
		const D = this._drox();
		const fn = D.fn;
		const arch = D.dom.architectModelVignetteEl;
		const settings = D.dom.generalSettingsVignetteEl;
		const rolePanel = D.dom.roleModelPanelEl;
		const settingsPanel = D.dom.generalSettingsPanelEl;

		const archOpen = D.state.rolePanelOpen === 'architect' && rolePanel && !rolePanel.hidden;
		const settingsOpen = Boolean(D.state.generalSettingsPanelOpen) && settingsPanel && !settingsPanel.hidden;

		if (arch) {
			arch.classList.toggle('panel-open', Boolean(archOpen));
			arch.setAttribute('aria-expanded', archOpen ? 'true' : 'false');
			if (!archOpen) {
				arch.blur();
				if (typeof fn.isConnectionConfigured === 'function' && fn.isConnectionConfigured()) {
					arch.classList.remove('connection-blocked');
					arch.removeAttribute('aria-disabled');
				}
			}
		}
		if (settings) {
			settings.classList.toggle('panel-open', Boolean(settingsOpen));
			settings.setAttribute('aria-expanded', settingsOpen ? 'true' : 'false');
			if (!settingsOpen) {
				settings.blur();
			}
		}

		if (typeof fn.syncConnectionVignetteAttention === 'function') {
			fn.syncConnectionVignetteAttention();
		}
		this._onDidReconcileToolbarUi.fire();
	}

	private _reconcileVignetteUi(): void {
		this._reconcileToolbarUi();
	}

	private _mountPanels(): void {
		if (DroxAgentsComposerDroxChatHost._panelsRoot) {
			return;
		}
		const root = mainWindow.document.createElement('div');
		root.className = 'drox-agents-composer-panels-mount';
		setDroxAgentsComposerInnerHtml(root, buildDroxComposerPanelsMarkup());
		mainWindow.document.body.appendChild(root);
		DroxAgentsComposerDroxChatHost._panelsRoot = root;
	}

	private async _loadScripts(): Promise<void> {
		for (const file of COMPOSER_DROX_CHAT_SCRIPTS) {
			await this._loadScript(FileAccess.asBrowserUri(`vs/workbench/contrib/drox/browser/media/${file}`).toString(true));
			if (file === 'droxChat/core/inner-html.js') {
				installDroxChatTrustedDomOverrides();
			}
		}
	}

	private _loadScript(src: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const script = mainWindow.document.createElement('script');
			script.src = toDroxAgentsComposerTrustedScriptUrl(src);
			script.async = false;
			script.onload = () => resolve();
			script.onerror = () => reject(new Error(`Failed to load ${src}`));
			mainWindow.document.head.appendChild(script);
		});
	}

	private _patchPanelPositioning(): void {
		const D = this._drox();
		const fn = D.fn;
		const afterPanel = (): void => {
			this._reconcileVignetteUi();
		};
		const wrap = <T extends (...args: never[]) => void>(orig: T | undefined, call: T, after?: () => void): T | undefined => {
			if (typeof orig !== 'function') {
				return undefined;
			}
			return ((...args: never[]) => {
				this._bindDomFromVisibleRoot();
				call(...args);
				after?.();
			}) as T;
		};
		const origCloseGeneral = fn.closeGeneralSettingsPanel as (() => void) | undefined;
		const origCloseRole = fn.closeRoleModelPanel as (() => void) | undefined;
		const origToggleGeneral = fn.toggleGeneralSettingsPanel as (() => void) | undefined;
		const origOpenGeneral = fn.openGeneralSettingsPanel as (() => void) | undefined;
		const origToggleRole = fn.toggleRoleModelPanel as (() => void) | undefined;
		const origOpenRole = fn.openRoleModelPanel as ((role?: string) => void) | undefined;
		if (origCloseGeneral) {
			fn.closeGeneralSettingsPanel = wrap(origCloseGeneral, origCloseGeneral, afterPanel)!;
		}
		if (origCloseRole) {
			fn.closeRoleModelPanel = wrap(origCloseRole, origCloseRole, afterPanel)!;
		}
		if (origOpenGeneral) {
			fn.openGeneralSettingsPanel = wrap(origOpenGeneral, origOpenGeneral, afterPanel)!;
		}
		if (origToggleGeneral) {
			fn.toggleGeneralSettingsPanel = wrap(origToggleGeneral, origToggleGeneral, afterPanel)!;
		}
		if (origOpenRole) {
			const openRole = origOpenRole;
			fn.openRoleModelPanel = ((role?: string) => {
				this._bindDomFromVisibleRoot();
				try {
					openRole(role);
				} catch (err) {
					this._resetArchitectPanelUi();
					throw err;
				}
				afterPanel();
			}) as (...args: unknown[]) => unknown;
		}
		if (origToggleRole) {
			fn.toggleRoleModelPanel = wrap(origToggleRole, origToggleRole, afterPanel)!;
		}
	}

	private _initHandlers(): void {
		const D = this._drox();
		const fn = D.fn;
		if (typeof fn.initAgentVignettes === 'function') {
			fn.initAgentVignettes();
		}
		if (typeof fn.initRoleModelVignettes === 'function') {
			fn.initRoleModelVignettes();
		}
		if (typeof fn.initGeneralSettingsVignettes === 'function') {
			fn.initGeneralSettingsVignettes();
		}
	}

	private _visibleToolbarRoot(): HTMLElement | undefined {
		for (const root of this._toolbarRoots) {
			if (root.isConnected && root.offsetParent !== null) {
				return root;
			}
		}
		return [...this._toolbarRoots].find(r => r.isConnected);
	}

	private _bindDomFromVisibleRoot(): void {
		const D = this._drox();
		const root = this._visibleToolbarRoot();
		const q = <T extends HTMLElement>(id: string): T | null =>
			(root?.querySelector(`#${id}`) as T | null) ?? mainWindow.document.getElementById(id) as T | null;

		D.dom.agentVignettesEl = q('agent-vignettes');
		D.dom.roleModelVignettesEl = q('role-model-vignettes');
		D.dom.generalSettingsVignettesEl = q('general-settings-vignettes');
		D.dom.generalSettingsVignetteEl = q('general-settings-vignette');
		D.dom.architectModelVignetteEl = q('architect-model-vignette');
		D.dom.generalSettingsPanelEl = mainWindow.document.getElementById('general-settings-panel');
		D.dom.generalSettingsPanelCloseEl = mainWindow.document.getElementById('general-settings-panel-close');
		D.dom.generalSettingsOpenAllEl = mainWindow.document.getElementById('general-settings-open-all');
		D.dom.roleModelPanelEl = mainWindow.document.getElementById('role-model-panel');
		D.dom.roleModelPanelTitleEl = mainWindow.document.getElementById('role-model-panel-title');
		D.dom.roleModelPanelCloseEl = mainWindow.document.getElementById('role-model-panel-close');
		D.dom.roleModelPanelSelectEl = mainWindow.document.getElementById('role-model-panel-select') as HTMLSelectElement | null;
		D.dom.roleModelPanelNumCtxEl = mainWindow.document.getElementById('role-model-panel-num-ctx') as HTMLSelectElement | null;
		D.dom.roleModelPanelNumCtxCustomEl = mainWindow.document.getElementById('role-model-panel-num-ctx-custom') as HTMLInputElement | null;
		D.dom.roleModelPanelTopPEl = mainWindow.document.getElementById('role-model-panel-top-p') as HTMLInputElement | null;
		D.dom.roleModelPanelTopKEl = mainWindow.document.getElementById('role-model-panel-top-k') as HTMLInputElement | null;
		D.dom.roleModelPanelRepeatPenaltyEl = mainWindow.document.getElementById('role-model-panel-repeat-penalty') as HTMLInputElement | null;
		D.dom.roleModelPanelMinPEl = mainWindow.document.getElementById('role-model-panel-min-p') as HTMLInputElement | null;
		D.dom.roleModelPanelSeedEl = mainWindow.document.getElementById('role-model-panel-seed') as HTMLInputElement | null;
		D.dom.roleModelPanelTemperatureEl = mainWindow.document.getElementById('role-model-panel-temperature') as HTMLInputElement | null;
		D.dom.roleModelPanelPresencePenaltyEl = mainWindow.document.getElementById('role-model-panel-presence-penalty') as HTMLInputElement | null;
		D.dom.roleModelPanelFrequencyPenaltyEl = mainWindow.document.getElementById('role-model-panel-frequency-penalty') as HTMLInputElement | null;
		D.dom.roleModelPanelMaxTokensEl = mainWindow.document.getElementById('role-model-panel-max-tokens') as HTMLInputElement | null;
		D.dom.roleModelPanelKeepAliveEl = mainWindow.document.getElementById('role-model-panel-keep-alive') as HTMLInputElement | null;
		D.dom.roleModelPanelReloadEl = mainWindow.document.getElementById('role-model-panel-reload');
	}

	private _handleHostMessage(message: DroxHostToWebviewMessage): void {
		const fn = this._drox().fn;
		if (typeof fn.handleHostMessage === 'function') {
			fn.handleHostMessage(message);
		}
	}

	private async _syncFromConfiguration(): Promise<void> {
		await this._pushPermissionModeFromConfiguration();
		pushGeneralSettingsToWebview(this._hostAdapter, this.runSettingsService, this.configurationService);
		await refreshDroxChatLlmModels(this._hostAdapter, this.llmModelsService, this.runSettingsService, this.configurationService);
		this._reconcileVignetteUi();
	}

	private async _pushPermissionModeFromConfiguration(): Promise<void> {
		const mode = this.runSettingsService.getPermissionMode();
		try {
			await this._ensureReady();
			this._bindDomFromVisibleRoot();
			this._handleHostMessage({ kind: 'permissionMode', mode });
		} catch {
			// Picker TS gère la surbrillance.
		}
	}

	private async _routeWebviewMessage(raw: DroxWebviewToHostMessage): Promise<void> {
		const deps = {
			configurationService: this.configurationService,
			runSettingsService: this.runSettingsService,
			llmModelsService: this.llmModelsService,
			droxEngineService: this.droxEngineService,
			requestService: this.requestService,
			dialogService: this.dialogService,
			notificationService: this.notificationService,
			commandService: this.commandService,
		};
		switch (raw.type) {
			case 'refreshLlmModels':
				await refreshDroxChatLlmModels(this._hostAdapter, deps.llmModelsService, deps.runSettingsService, deps.configurationService);
				break;
			case 'testLlmConnection': {
				await deps.droxEngineService.initialize();
				const result = await testDroxLlmConnectionDraft(
					{ droxEngineService: deps.droxEngineService, requestService: deps.requestService },
					raw.settings as IDroxGeneralSettingsPatch,
				);
				postConnectionTestResult(this._hostAdapter, raw.requestId, result);
				break;
			}
			case 'setArchitectModel':
				await setDroxArchitectModelFromWebview(deps, raw.model);
				await refreshDroxChatLlmModels(this._hostAdapter, deps.llmModelsService, deps.runSettingsService, deps.configurationService);
				break;
			case 'setArchitectLlmParams':
				await setDroxArchitectLlmParamsFromWebview(deps, {
					numCtx: raw.numCtx,
					temperature: raw.temperature,
					topP: raw.topP,
					topK: raw.topK,
					repeatPenalty: raw.repeatPenalty,
					minP: raw.minP,
					seed: raw.seed,
					presencePenalty: raw.presencePenalty,
					frequencyPenalty: raw.frequencyPenalty,
					maxTokens: raw.maxTokens,
					keepAlive: raw.keepAlive,
					mutedParams: raw.mutedParams,
				});
				break;
			case 'setGeneralSettings':
				await setDroxGeneralSettingsFromWebview(deps, raw.settings as IDroxGeneralSettingsPatch);
				pushGeneralSettingsToWebview(this._hostAdapter, deps.runSettingsService, deps.configurationService);
				break;
			case 'setPermissionMode': {
				const resolved = resolveDroxPermissionMode(raw.permissionMode);
				if (resolved.downgradedFromProfessor) {
					deps.notificationService.warn(getProfessorModeRemovedNotificationMessage());
				}
				const workspaceResource = deps.runSettingsService.getWorkspaceResource();
				await setDroxPermissionModeConfiguration(deps.configurationService, resolved.mode, workspaceResource);
				this._handleHostMessage({ kind: 'permissionMode', mode: resolved.mode });
				break;
			}
			case 'openSettings':
				await this._ensureReady();
				this._bindDomFromVisibleRoot();
				if (typeof this._drox().fn.closeGeneralSettingsPanel === 'function') {
					this._drox().fn.closeGeneralSettingsPanel();
				}
				this._reconcileVignetteUi();
				await deps.commandService.executeCommand(DroxCommands.OpenSettings);
				break;
			default:
				break;
		}
	}
}

registerSingleton(IDroxAgentsComposerDroxChatHost, DroxAgentsComposerDroxChatHost, InstantiationType.Delayed);
