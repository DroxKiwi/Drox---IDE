/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { MenuWorkbenchButtonBar } from '../../../../../platform/actions/browser/buttonbar.js';
import { IMenuService, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { DroxChangesInlineDiffWidget } from '../../../../../sessions/contrib/providers/drox/browser/droxChangesInlineDiffWidget.js';
import { ISessionFileChange } from '../../../../../sessions/services/sessions/common/session.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IDroxIdeChangesUiState } from '../../common/droxIdeChangesUiState.js';
import {
	DROX_SESSION_COMMIT_ACTION_ID,
	DROX_SESSION_COMMIT_AND_PUSH_ACTION_ID,
	DROX_SESSION_CREATE_PR_ACTION_ID,
} from '../droxSessionGitComposerActions.js';
import './media/droxIdeChanges.css';

/**
 * IDE Changes view — same inline widget as Agents (`DroxChangesInlineDiffWidget`),
 * hosted in a Sidebar activity-bar container (like Source Control).
 */
export class DroxIdeChangesViewPane extends ViewPane {

	private _host: HTMLElement | undefined;
	private _actionsContainer: HTMLElement | undefined;
	private _widget: DroxChangesInlineDiffWidget | undefined;
	private readonly _widgetStore = this._register(new DisposableStore());
	private readonly _toolbarStore = this._register(new DisposableStore());
	private readonly _sessionResourceObs = observableValue<URI | undefined>('droxIdeChangesSession', undefined);
	private readonly _mergedFilesObs = observableValue<readonly ISessionFileChange[] | undefined>('droxIdeChangesMerged', undefined);
	private _toolbarSessionKey = '';

	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IDroxIdeChangesUiState private readonly uiState: IDroxIdeChangesUiState,
		@IMenuService private readonly menuService: IMenuService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);

		this._register(this.uiState.onDidChange(() => this._applyUiState()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('drox-ide-changes');

		this._actionsContainer = dom.append(container, dom.$('.chat-editing-session-actions.outside-card.drox-ide-changes-actions'));
		this._host = dom.append(container, dom.$('.drox-changes-inline-host'));

		this._widgetStore.clear();
		this._widget = this._widgetStore.add(this.instantiationService.createInstance(
			DroxChangesInlineDiffWidget,
			{
				parent: this._host,
				sessionResourceObs: this._sessionResourceObs,
				externalMergedFilesObs: this._mergedFilesObs,
			},
		));
		this._applyUiState();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		const actionsHeight = this._actionsContainer?.offsetHeight ?? 0;
		const contentHeight = Math.max(0, height - actionsHeight);
		if (this._host) {
			this._host.style.height = `${contentHeight}px`;
			this._host.style.width = `${width}px`;
		}
		this._widget?.layout(contentHeight, width);
	}

	private _applyUiState(): void {
		this._sessionResourceObs.set(this.uiState.sessionResource, undefined);
		this._mergedFilesObs.set(this.uiState.mergedFiles, undefined);
		if (this._actionsContainer) {
			dom.setVisibility(this.uiState.hasUncommittedChanges, this._actionsContainer);
		}
		this._ensureToolbar();
	}

	private _ensureToolbar(): void {
		if (!this._actionsContainer) {
			return;
		}
		const sessionKey = this.uiState.sessionResource?.toString() ?? '';
		if (this._toolbarStore.size > 0 && this._toolbarSessionKey === sessionKey) {
			return;
		}
		this._toolbarSessionKey = sessionKey;
		this._toolbarStore.clear();
		dom.clearNode(this._actionsContainer);

		const sessionResource = this.uiState.sessionResource;
		this._toolbarStore.add(new MenuWorkbenchButtonBar(
			this._actionsContainer,
			MenuId.AgentsChangesToolbar,
			{
				telemetrySource: 'droxIdeChangesView',
				menuOptions: sessionResource
					? { arg: sessionResource, shouldForwardArgs: true }
					: { shouldForwardArgs: true },
				buttonConfigProvider: (action) => {
					if (
						action.id === DROX_SESSION_COMMIT_ACTION_ID ||
						action.id === DROX_SESSION_COMMIT_AND_PUSH_ACTION_ID ||
						action.id === DROX_SESSION_CREATE_PR_ACTION_ID
					) {
						return { showIcon: true, showLabel: true, isSecondary: false };
					}
					return { showIcon: true, showLabel: true, isSecondary: false };
				},
			},
			this.menuService,
			this.contextKeyService,
			this.contextMenuService,
			this.keybindingService,
			this.telemetryService,
			this.hoverService,
		));
	}
}
