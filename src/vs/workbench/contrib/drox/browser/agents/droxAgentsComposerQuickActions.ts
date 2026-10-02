/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { Menus } from '../../../../../sessions/browser/menus.js';
import { SessionHeaderMetaActionViewItem } from '../../../../../sessions/browser/parts/sessionHeaderMetaActionViewItem.js';
import { isDroxNativeChatStackEnabled } from '../../common/droxAgentsConfiguration.js';
import { isDroxAgentsChatSessionType } from './droxAgentsChatInputIntegration.js';
import './media/droxAgentsComposerQuickActions.css';

/** Changes / Commit pills mounted above the chat composer (Drox sessions). */
export class DroxAgentsComposerQuickActionsHost extends Disposable {

	private _toolbar: MenuWorkbenchToolBar | undefined;
	private _sessionResource: URI | undefined;
	private readonly _hostDisposables = this._register(new DisposableStore());

	constructor(
		readonly element: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.element.classList.add('drox-composer-quick-actions-host');
		this.element.style.display = 'none';
	}

	mountIfNeeded(sessionType: string | undefined, sessionResource?: URI): void {
		if (!isDroxNativeChatStackEnabled(this.configurationService) || !isDroxAgentsChatSessionType(sessionType)) {
			this._unmount();
			return;
		}

		const sessionChanged = !isEqual(this._sessionResource, sessionResource);
		this._sessionResource = sessionResource;

		if (!this._toolbar || sessionChanged) {
			this._rebuildToolbar();
		}
	}

	private _rebuildToolbar(): void {
		this._toolbar = undefined;
		this._hostDisposables.clear();
		dom.clearNode(this.element);
		this.element.style.display = '';

		const menuOptions = this._sessionResource
			? { arg: this._sessionResource, shouldForwardArgs: true }
			: { shouldForwardArgs: true };

		this._toolbar = this._hostDisposables.add(this.instantiationService.createInstance(
			MenuWorkbenchToolBar,
			this.element,
			Menus.SessionComposerQuickActions,
			{
				telemetrySource: 'droxComposerQuickActions',
				hiddenItemStrategy: HiddenItemStrategy.Ignore,
				menuOptions,
				actionViewItemProvider: (action, options) => {
					if (action instanceof MenuItemAction) {
						return this.instantiationService.createInstance(SessionHeaderMetaActionViewItem, undefined, action, options);
					}
					return undefined;
				},
			},
		));
	}

	private _unmount(): void {
		this._toolbar = undefined;
		this._sessionResource = undefined;
		this._hostDisposables.clear();
		dom.clearNode(this.element);
		this.element.style.display = 'none';
	}
}

export function createDroxAgentsComposerQuickActionsHost(
	instantiationService: IInstantiationService,
	configurationService: IConfigurationService,
	parent: HTMLElement,
	beforeChild?: HTMLElement,
): DroxAgentsComposerQuickActionsHost | undefined {
	if (!isDroxNativeChatStackEnabled(configurationService)) {
		return undefined;
	}
	const element = dom.$('.drox-composer-quick-actions-host');
	if (beforeChild) {
		parent.insertBefore(element, beforeChild);
	} else {
		parent.appendChild(element);
	}
	return instantiationService.createInstance(DroxAgentsComposerQuickActionsHost, element);
}
