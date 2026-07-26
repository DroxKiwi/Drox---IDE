/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import {
	persistDroxArchitectModelUser,
	readDroxArchitectModelUser,
} from '../../common/droxAgentsConfiguration.js';
import { DroxSetting } from '../../common/droxConfiguration.js';
import { isDroxEmbeddingModelId } from '../../common/droxAgentsModels.js';
import { droxLlmSnapshotDiffersFromConfiguration } from '../../common/droxChatConfigSync.js';
import { IDroxLlmModelsService } from '../../common/droxLlmModelsService.js';

interface IModelPickerItem {
	readonly id: string;
	readonly label: string;
}

export class DroxIdeModelPicker extends Disposable {

	private _triggerElement: HTMLAnchorElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IDroxLlmModelsService private readonly llmModelsService: IDroxLlmModelsService,
		@IHoverService private readonly hoverService: IHoverService,
		@IHostService private readonly hostService: IHostService,
	) {
		super();
		this._register(this.llmModelsService.onDidChange(() => this._updateTrigger()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(DroxSetting.ArchitectModel) || e.affectsConfiguration(DroxSetting.Model)) {
				this._updateTrigger();
			}
		}));
		this._register(this.hostService.onDidChangeFocus(focus => {
			if (!focus) {
				return;
			}
			const workspaceResource = this.workspaceContextService.getWorkspace().folders[0]?.uri;
			if (droxLlmSnapshotDiffersFromConfiguration(this.llmModelsService.snapshot, this.configurationService, workspaceResource)) {
				void this.llmModelsService.refresh().then(() => this._updateTrigger());
			}
		}));
	}

	render(container: HTMLElement): void {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot.drox-ide-model-picker'));
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label')) as HTMLAnchorElement;
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;

		const tooltip = localize('droxIde.modelPicker', 'Model');
		this._renderDisposables.add(this.hoverService.setupDelayedHover(trigger, () => ({ content: tooltip })));

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
		if (this.llmModelsService.snapshot.models.length === 0 && !this.llmModelsService.snapshot.loading) {
			void this.llmModelsService.refresh();
		}
	}

	private _currentModelId(): string {
		return readDroxArchitectModelUser(this.configurationService);
	}

	private _listModels(): readonly IModelPickerItem[] {
		const snap = this.llmModelsService.snapshot;
		return snap.models
			.filter(model => !isDroxEmbeddingModelId(model))
			.map(model => ({ id: model, label: model }));
	}

	private _updateTrigger(): void {
		if (!this._triggerElement) {
			return;
		}
		dom.clearNode(this._triggerElement);

		const current = this._currentModelId();
		const label = current || localize('droxIde.modelPickerNone', 'No model');

		dom.append(this._triggerElement, renderIcon(Codicon.sparkle));

		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;

		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));

		this._triggerElement.ariaLabel = localize('droxIde.modelPickerAria', 'Pick model, {0}', label);
	}

	private _showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible) {
			return;
		}

		const current = this._currentModelId();
		const items = this._listModels();
		const triggerElement = this._triggerElement;

		const actionItems: IActionListItem<IModelPickerItem>[] = items.map(item => ({
			kind: ActionListItemKind.Action,
			label: item.label,
			group: { title: '', icon: Codicon.sparkle },
			item: { ...item, checked: item.id === current },
		}));

		const delegate: IActionListDelegate<IModelPickerItem> = {
			onSelect: async (item) => {
				this.actionWidgetService.hide();
				const workspaceResource = this.workspaceContextService.getWorkspace().folders[0]?.uri;
				await persistDroxArchitectModelUser(this.configurationService, item.id, workspaceResource);
				this._updateTrigger();
			},
			onHide: () => triggerElement.focus(),
		};

		this.actionWidgetService.show<IModelPickerItem>(
			'drox-ide-model-picker',
			false,
			actionItems,
			delegate,
			triggerElement,
			undefined,
			[],
			{
				getAriaLabel: i => i.label ?? '',
				getWidgetAriaLabel: () => localize('droxIde.modelPickerAriaLabel', 'Model picker'),
			},
		);
	}

	ensureValidModel(): void {
		const current = this._currentModelId();
		if (!current || !isDroxEmbeddingModelId(current)) {
			return;
		}
		const models = this._listModels();
		const preferred = models.find(m => !isDroxEmbeddingModelId(m.id));
		if (!preferred) {
			return;
		}
		const workspaceResource = this.workspaceContextService.getWorkspace().folders[0]?.uri;
		void persistDroxArchitectModelUser(this.configurationService, preferred.id, workspaceResource);
	}
}
