/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { setDroxPermissionModeConfiguration } from '../../common/droxAgentsConfiguration.js';
import { DroxPermissionMode, getProfessorModeRemovedNotificationMessage, resolveDroxPermissionMode } from '../../common/droxPermissionAsk.js';
import { droxConfigChangeAffectsPermissionMode } from '../../common/droxChatConfigSync.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';

interface IPermissionModeItem {
	readonly value: DroxPermissionMode;
	readonly label: string;
	readonly description: string;
}

function getPermissionModeIcon(value: DroxPermissionMode | undefined): ThemeIcon {
	switch (value) {
		case 'analyze': return Codicon.lightbulb;
		case 'trustEdit': return Codicon.edit;
		case 'imNotCrazy': return Codicon.shield;
		default: return Codicon.shield;
	}
}

function getPermissionModeItems(): readonly IPermissionModeItem[] {
	return [
		{
			value: 'analyze',
			label: localize('droxChatModeAnalyzeName', 'Planifier'),
			description: localize('droxChatModeAnalyzeDesc', 'TUI --plan — propose only; explore and plan, no writes to disk.'),
		},
		{
			value: 'trustEdit',
			label: localize('droxChatModeTrustEditName', 'Trust Edit'),
			description: localize('droxChatModeTrustEditDesc', 'TUI --apply — writes to disk automatically, no confirmation prompts.'),
		},
		{
			value: 'imNotCrazy',
			label: localize('droxChatModeImNotCrazyName', "I'm Not Crazy"),
			description: localize('droxChatModeImNotCrazyDesc', 'TUI default — Allow/Deny per write; free reading.'),
		},
	];
}

export class DroxAgentsPermissionModePicker extends Disposable {

	private readonly _renderDisposables = this._register(new DisposableStore());
	private _triggerElement: HTMLElement | undefined;

	constructor(
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IDroxRunSettingsService private readonly _runSettingsService: IDroxRunSettingsService,
		@IHoverService private readonly _hoverService: IHoverService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (droxConfigChangeAffectsPermissionMode(e)) {
				this._updateTrigger();
			}
		}));
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.drox-agents-permission-picker'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;

		const tooltip = localize('droxChatPermissionMode', 'Request mode');
		this._renderDisposables.add(this._hoverService.setupDelayedHover(trigger, () => ({ content: tooltip })));

		this._renderDisposables.add(Gesture.addTarget(trigger));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, e => {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}));
		}
		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}
		}));

		this._updateTrigger();
	}

	private _currentMode(): DroxPermissionMode {
		return this._runSettingsService.getPermissionMode();
	}

	private _updateTrigger(): void {
		if (!this._triggerElement) {
			return;
		}
		dom.clearNode(this._triggerElement);

		const mode = this._currentMode();
		const item = getPermissionModeItems().find(i => i.value === mode);
		const label = item?.label ?? mode;

		dom.append(this._triggerElement, renderIcon(getPermissionModeIcon(mode)));

		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;

		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));

		this._triggerElement.ariaLabel = localize('droxAgents.permissionModePicker.triggerAriaLabel', 'Pick request mode, {0}', label);
	}

	private _showPicker(): void {
		if (!this._triggerElement || this._actionWidgetService.isVisible) {
			return;
		}

		const current = this._currentMode();
		const items = getPermissionModeItems();
		const triggerElement = this._triggerElement;

		const actionItems: IActionListItem<IPermissionModeItem>[] = items.map(item => ({
			kind: ActionListItemKind.Action,
			label: item.label,
			detail: item.description,
			group: { title: '', icon: getPermissionModeIcon(item.value) },
			item: { ...item, checked: item.value === current },
		}));

		const delegate: IActionListDelegate<IPermissionModeItem> = {
			onSelect: async (item) => {
				this._actionWidgetService.hide();
				const resolved = resolveDroxPermissionMode(item.value);
				if (resolved.downgradedFromProfessor) {
					this._notificationService.warn(getProfessorModeRemovedNotificationMessage());
				}
				const workspaceResource = this._workspaceContextService.getWorkspace().folders[0]?.uri;
				await setDroxPermissionModeConfiguration(this._configurationService, resolved.mode, workspaceResource);
				this._updateTrigger();
			},
			onHide: () => triggerElement.focus(),
		};

		this._actionWidgetService.show<IPermissionModeItem>(
			'droxAgentsPermissionModePicker',
			false,
			actionItems,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: i => i.label ?? '',
				getWidgetAriaLabel: () => localize('droxAgents.permissionModePicker.ariaLabel', 'Request mode picker'),
			},
		);
	}
}
