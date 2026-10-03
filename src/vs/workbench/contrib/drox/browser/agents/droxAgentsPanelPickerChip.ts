/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Gesture, EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { appendDroxActivityGrid } from '../droxActivityGrid.js';

export interface IDroxAgentsPanelPickerChipOptions {
	readonly id: string;
	readonly icon: ThemeIcon;
	readonly defaultLabel: string;
	readonly title: string;
	readonly extraClass?: string;
}

export class DroxAgentsPanelPickerChip extends Disposable {

	private readonly _onDidClick = this._register(new Emitter<void>());
	readonly onDidClick = this._onDidClick.event;

	private readonly _renderDisposables = this._register(new DisposableStore());
	readonly slotElement: HTMLElement;
	readonly triggerElement: HTMLAnchorElement;
	private _labelElement: HTMLElement | undefined;

	constructor(private readonly _options: IDroxAgentsPanelPickerChipOptions) {
		super();
		this.slotElement = dom.$('.sessions-chat-picker-slot.drox-agents-panel-picker');
		this.triggerElement = dom.$('a.action-label.drox-agents-panel-picker-trigger') as HTMLAnchorElement;
		this.triggerElement.id = _options.id;
		this.triggerElement.title = _options.title;
		this.triggerElement.setAttribute('aria-label', _options.title);
		if (_options.extraClass) {
			this.triggerElement.classList.add(..._options.extraClass.split(/\s+/));
		}
	}

	render(parent: HTMLElement): void {
		this._renderDisposables.clear();
		parent.appendChild(this.slotElement);
		this._renderDisposables.add({ dispose: () => this.slotElement.remove() });

		this.slotElement.appendChild(this.triggerElement);
		dom.append(this.triggerElement, renderIcon(this._options.icon));
		this._labelElement = dom.append(this.triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		this.setLabel(this._options.defaultLabel);

		this.triggerElement.tabIndex = 0;
		this.triggerElement.role = 'button';
		this.triggerElement.setAttribute('aria-expanded', 'false');

		appendDroxActivityGrid(this.triggerElement, 'activity-grid activity-grid-inline drox-panel-loading-grid');

		this._renderDisposables.add(Gesture.addTarget(this.triggerElement));
		for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
			this._renderDisposables.add(dom.addDisposableListener(this.triggerElement, eventType, e => {
				dom.EventHelper.stop(e, true);
				this._onDidClick.fire();
			}));
		}
	}

	setLabel(label: string): void {
		if (this._labelElement) {
			this._labelElement.textContent = label;
		}
		this.triggerElement.setAttribute('aria-label', `${this._options.title}: ${label}`);
	}

	setPanelOpen(open: boolean): void {
		this.triggerElement.classList.toggle('panel-open', open);
		this.triggerElement.setAttribute('aria-expanded', open ? 'true' : 'false');
		if (!open) {
			this.triggerElement.blur();
		}
	}

	setConnectionAttention(attention: boolean): void {
		this.triggerElement.classList.toggle('connection-attention', attention);
	}

	setConnectionBlocked(blocked: boolean): void {
		this.triggerElement.classList.toggle('connection-blocked', blocked);
		this.triggerElement.setAttribute('aria-disabled', blocked ? 'true' : 'false');
	}

	setLoading(loading: boolean): void {
		this.slotElement.classList.toggle('loading', loading);
		this.triggerElement.setAttribute('aria-busy', loading ? 'true' : 'false');
	}
}

export function createModelSettingsPickerChip(defaultLabel: string, title: string): DroxAgentsPanelPickerChip {
	return new DroxAgentsPanelPickerChip({
		id: 'architect-model-vignette',
		icon: Codicon.settingsGear,
		defaultLabel,
		title,
		extraClass: 'role-model-vignette',
	});
}

export function createServerSettingsPickerChip(defaultLabel: string, title: string): DroxAgentsPanelPickerChip {
	return new DroxAgentsPanelPickerChip({
		id: 'general-settings-vignette',
		icon: Codicon.server,
		defaultLabel,
		title,
		extraClass: 'general-settings-vignette',
	});
}

export function createCodebaseStatusPickerChip(defaultLabel: string, title: string): DroxAgentsPanelPickerChip {
	return new DroxAgentsPanelPickerChip({
		id: 'codebase-status-vignette',
		icon: Codicon.symbolClass,
		defaultLabel,
		title,
		extraClass: 'codebase-status-vignette',
	});
}

export function createCodebaseForcePickerChip(defaultLabel: string, title: string): DroxAgentsPanelPickerChip {
	return new DroxAgentsPanelPickerChip({
		id: 'codebase-force-vignette',
		icon: Codicon.pin,
		defaultLabel,
		title,
		extraClass: 'codebase-force-vignette',
	});
}

export function createRegulationPickerChip(defaultLabel: string, title: string): DroxAgentsPanelPickerChip {
	return new DroxAgentsPanelPickerChip({
		id: 'regulation-status-vignette',
		icon: Codicon.graphLine,
		defaultLabel,
		title,
		extraClass: 'regulation-status-vignette',
	});
}
