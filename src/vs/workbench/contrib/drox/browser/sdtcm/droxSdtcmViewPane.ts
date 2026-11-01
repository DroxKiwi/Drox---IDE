/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { $, addDisposableListener, clearNode } from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { localize } from '../../../../../nls.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { DroxCommands } from '../../common/drox.js';
import { DroxSdtcmForm, DroxSdtcmKind } from '../../common/sdtcm/droxSdtcmMap.js';
import { DroxSdtcmPlacementMode } from '../../common/sdtcm/placement/droxSdtcmPlacement.js';
import { IDroxSdtcmService } from './droxSdtcmService.js';
import './media/droxSdtcm.css';

/** Activity-bar entry. The map itself is the editor tab. */
export class DroxSdtcmViewPane extends ViewPane {

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
		@ICommandService private readonly commandService: ICommandService,
		@IDroxSdtcmService private readonly sdtcmService: IDroxSdtcmService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	override setVisible(visible: boolean): void {
		super.setVisible(visible);
		if (visible) {
			void this.commandService.executeCommand(DroxCommands.OpenSdtcm);
		}
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		const root = $('div.drox-sdtcm-side');
		const hint = $('p.drox-sdtcm-side-hint');
		hint.textContent = localize('drox.sdtcm.sideHint', 'The map opens in an editor tab.');
		const button = $('button.drox-sdtcm-side-open');
		button.textContent = localize('drox.sdtcm.sideOpen', 'Open the map');
		this._register(addDisposableListener(button, 'click', () => {
			void this.commandService.executeCommand(DroxCommands.OpenSdtcm);
		}));
		const filters = $('div.drox-sdtcm-filters');
		const display = this.sdtcmService.getDisplay();
		this._addToggle(filters, localize('drox.sdtcm.filterLinks', 'Links'), display.links, checked => {
			const current = this.sdtcmService.getDisplay();
			this.sdtcmService.setDisplay({ ...current, links: checked });
		});
		for (const kind of ['type', 'operation', 'value', 'source'] as const) {
			this._addToggle(filters, kind, display.kinds.has(kind), checked => this._toggleKind(kind, checked));
		}
		for (const form of ['declare', 'apply'] as const) {
			this._addToggle(filters, form, display.forms.has(form), checked => this._toggleForm(form, checked));
		}
		const placementTitle = $('div.drox-sdtcm-side-label');
		placementTitle.textContent = localize('drox.sdtcm.placement', 'Placement');
		const placement = $('div.drox-sdtcm-filters');
		this._addChoice(placement, 'free', localize('drox.sdtcm.freeView', 'Free view'), display.placement === 'free');
		this._addChoice(placement, 'weight', localize('drox.sdtcm.weightView', 'Weight view'), display.placement === 'weight');
		const attraction = $('div.drox-sdtcm-attraction');
		attraction.hidden = display.placement !== 'weight';
		const attractionLabel = $('span');
		attractionLabel.textContent = localize('drox.sdtcm.attraction', 'Attraction');
		const attractionInput = $('input') as HTMLInputElement;
		attractionInput.type = 'range';
		attractionInput.min = '0';
		attractionInput.max = '100';
		attractionInput.value = String(Math.round(display.attraction * 100));
		this._register(addDisposableListener(attractionInput, 'input', () => {
			const current = this.sdtcmService.getDisplay();
			this.sdtcmService.setDisplay({ ...current, attraction: Number(attractionInput.value) / 100 });
		}));
		this._register(this.sdtcmService.onDidChangeDisplay(next => {
			attraction.hidden = next.placement !== 'weight';
			if (document.activeElement !== attractionInput) {
				attractionInput.value = String(Math.round(next.attraction * 100));
			}
		}));
		attraction.appendChild(attractionLabel);
		attraction.appendChild(attractionInput);
		root.appendChild(hint);
		root.appendChild(button);
		root.appendChild(filters);
		const focusHost = $('div.drox-sdtcm-focus');
		const focusUi = this._register(new DisposableStore());
		const renderFocus = () => {
			focusUi.clear();
			clearNode(focusHost);
			const title = $('div.drox-sdtcm-side-label');
			title.textContent = localize('drox.sdtcm.keepInFocus', 'Keep in focus');
			focusHost.appendChild(title);
			const ids = this.sdtcmService.getDisplay().focus;
			if (!ids.length) {
				const empty = $('p.drox-sdtcm-side-hint');
				empty.textContent = localize('drox.sdtcm.noFocus', 'No folder kept in focus.');
				focusHost.appendChild(empty);
				return;
			}
			const clear = $('button.drox-sdtcm-side-open');
			clear.textContent = localize('drox.sdtcm.clearFocus', 'Clear');
			focusUi.add(addDisposableListener(clear, 'click', () => {
				const current = this.sdtcmService.getDisplay();
				this.sdtcmService.setDisplay({ ...current, focus: [] });
			}));
			focusHost.appendChild(clear);
			for (const id of ids) {
				const row = $('div.drox-sdtcm-focus-row');
				const name = $('span');
				name.textContent = id.startsWith('folder:') ? id.slice('folder:'.length) : id;
				const remove = $('button.drox-sdtcm-focus-remove');
				remove.textContent = localize('drox.sdtcm.removeFocus', 'Remove');
				focusUi.add(addDisposableListener(remove, 'click', () => {
					const current = this.sdtcmService.getDisplay();
					this.sdtcmService.setDisplay({ ...current, focus: current.focus.filter(item => item !== id) });
				}));
				row.appendChild(name);
				row.appendChild(remove);
				focusHost.appendChild(row);
			}
		};
		renderFocus();
		this._register(this.sdtcmService.onDidChangeDisplay(() => renderFocus()));
		root.appendChild(placementTitle);
		root.appendChild(placement);
		root.appendChild(attraction);
		root.appendChild(focusHost);
		container.appendChild(root);
	}

	private _addChoice(parent: HTMLElement, mode: DroxSdtcmPlacementMode, label: string, checked: boolean): void {
		const row = $('label');
		const box = $('input') as HTMLInputElement;
		box.type = 'radio';
		box.name = 'drox-sdtcm-placement';
		box.checked = checked;
		this._register(addDisposableListener(box, 'change', () => {
			if (!box.checked) {
				return;
			}
			const current = this.sdtcmService.getDisplay();
			this.sdtcmService.setDisplay({ ...current, placement: mode });
		}));
		row.appendChild(box);
		row.appendChild(document.createTextNode(label));
		parent.appendChild(row);
	}

	private _addToggle(parent: HTMLElement, label: string, checked: boolean, onChange: (checked: boolean) => void): void {
		const row = $('label');
		const box = $('input') as HTMLInputElement;
		box.type = 'checkbox';
		box.checked = checked;
		this._register(addDisposableListener(box, 'change', () => onChange(box.checked)));
		row.appendChild(box);
		row.appendChild(document.createTextNode(label));
		parent.appendChild(row);
	}

	private _toggleKind(kind: DroxSdtcmKind, checked: boolean): void {
		const current = this.sdtcmService.getDisplay();
		const kinds = new Set(current.kinds);
		if (checked) {
			kinds.add(kind);
		} else {
			kinds.delete(kind);
		}
		this.sdtcmService.setDisplay({ ...current, kinds });
	}

	private _toggleForm(form: DroxSdtcmForm, checked: boolean): void {
		const current = this.sdtcmService.getDisplay();
		const forms = new Set(current.forms);
		if (checked) {
			forms.add(form);
		} else {
			forms.delete(form);
		}
		this.sdtcmService.setDisplay({ ...current, forms });
	}
}
