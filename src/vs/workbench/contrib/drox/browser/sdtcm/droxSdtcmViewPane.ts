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
import { DROX_SDTCM_PROBE_PHASES, DroxSdtcmProbePhase } from '../../common/sdtcm/droxSdtcmConsistency.js';
import { DroxSdtcmForm, DroxSdtcmKind } from '../../common/sdtcm/droxSdtcmMap.js';
import { droxSdtcmTagNameOk, IDroxSdtcmTag } from '../../common/sdtcm/droxSdtcmRole.js';
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
		const toolsTitle = $('div.drox-sdtcm-side-label');
		toolsTitle.textContent = localize('drox.sdtcm.tools', 'Tools');
		const tools = $('div.drox-sdtcm-filters');
		const display = this.sdtcmService.getDisplay();
		this._addToggle(tools, localize('drox.sdtcm.move', 'Move'), display.move, checked => {
			const current = this.sdtcmService.getDisplay();
			this.sdtcmService.setDisplay({ ...current, move: checked });
		}, () => this.sdtcmService.getDisplay().move);
		const consistencyTitle = $('div.drox-sdtcm-side-label');
		consistencyTitle.textContent = localize('drox.sdtcm.consistency', 'Consistency');
		tools.appendChild(consistencyTitle);
		const chosen = new Set<DroxSdtcmProbePhase>(DROX_SDTCM_PROBE_PHASES);
		for (const phase of DROX_SDTCM_PROBE_PHASES) {
			this._addToggle(tools, phase, true, checked => {
				if (checked) {
					chosen.add(phase);
				} else {
					chosen.delete(phase);
				}
			});
		}
		const turnsRow = $('label.drox-sdtcm-turns');
		turnsRow.appendChild(document.createTextNode(localize('drox.sdtcm.turns', 'Turns')));
		const turnsInput = $('input') as HTMLInputElement;
		turnsInput.type = 'number';
		turnsInput.min = '1';
		turnsInput.max = '20';
		turnsInput.value = '2';
		turnsRow.appendChild(turnsInput);
		tools.appendChild(turnsRow);
		const run = $('button.drox-sdtcm-side-open') as HTMLButtonElement;
		run.textContent = localize('drox.sdtcm.runConsistency', 'Run consistency');
		this._register(addDisposableListener(run, 'click', () => {
			const turns = Number(turnsInput.value);
			void this.sdtcmService.probe([...chosen], Number.isFinite(turns) ? turns : 2);
		}));
		this._register(this.sdtcmService.onDidChange(() => {
			run.disabled = this.sdtcmService.getSnapshot().phase === 'running';
		}));
		tools.appendChild(run);
		const tagHost = $('div.drox-sdtcm-tags');
		const tagUi = this._register(new DisposableStore());
		let tagStamp = '';
		const renderTags = () => {
			const listed = this.sdtcmService.getSnapshot().tags;
			const shown = [...this.sdtcmService.getDisplay().visibleTags].sort().join('\n');
			const stamp = `${shown}|${listed.map(tag => `${tag.name}\u0000${tag.description}\u0000${tag.color}\u0000${tag.scope}`).join('\n')}`;
			if (stamp === tagStamp) {
				return;
			}
			tagStamp = stamp;
			tagUi.clear();
			clearNode(tagHost);
			const title = $('div.drox-sdtcm-side-label');
			title.textContent = localize('drox.sdtcm.tags', 'Tags');
			tagHost.appendChild(title);
			const form = $('div.drox-sdtcm-tag-add');
			const nameInput = $('input') as HTMLInputElement;
			nameInput.type = 'text';
			nameInput.placeholder = localize('drox.sdtcm.tagName', 'Name');
			nameInput.maxLength = 32;
			const descriptionInput = $('input') as HTMLInputElement;
			descriptionInput.type = 'text';
			descriptionInput.placeholder = localize('drox.sdtcm.tagDescription', 'Description');
			descriptionInput.maxLength = 240;
			const scopeInput = $('select') as HTMLSelectElement;
			for (const scope of ['folder', 'file', 'brick', 'data'] as const) {
				const option = $('option') as HTMLOptionElement;
				option.value = scope;
				option.textContent = scope === 'folder' ? localize('drox.sdtcm.tagFolder', 'Folder')
					: scope === 'file' ? localize('drox.sdtcm.tagFile', 'File')
						: scope === 'data' ? localize('drox.sdtcm.tagData', 'Data')
							: localize('drox.sdtcm.tagBrick', 'Brick');
				scopeInput.appendChild(option);
			}
			scopeInput.value = 'brick';
			const add = $('button.drox-sdtcm-side-open');
			add.textContent = localize('drox.sdtcm.addTag', 'Add');
			tagUi.add(addDisposableListener(add, 'click', () => {
				const name = nameInput.value.trim();
				const description = descriptionInput.value.trim();
				const scope = scopeInput.value === 'folder' || scopeInput.value === 'file' || scopeInput.value === 'data' ? scopeInput.value : 'brick';
				const tags = this.sdtcmService.getSnapshot().tags;
				if (!droxSdtcmTagNameOk(name) || !description || tags.some(tag => tag.name === name)) {
					return;
				}
				const color = DROX_SDTCM_TAG_COLORS[tags.length % DROX_SDTCM_TAG_COLORS.length];
				this.sdtcmService.setTags([...tags, { name, description, color, scope }]);
			}));
			form.appendChild(nameInput);
			form.appendChild(descriptionInput);
			form.appendChild(scopeInput);
			form.appendChild(add);
			tagHost.appendChild(form);
			const visible = this.sdtcmService.getDisplay().visibleTags;
			for (const tag of this.sdtcmService.getSnapshot().tags) {
				tagHost.appendChild(this._tagRow(tag, visible.has(tag.name), tagUi));
			}
		};
		renderTags();
		this._register(this.sdtcmService.onDidChange(() => renderTags()));
		this._register(this.sdtcmService.onDidChangeDisplay(() => renderTags()));
		const filters = $('div.drox-sdtcm-filters');
		this._addToggle(filters, localize('drox.sdtcm.filterLinks', 'Links'), display.links, checked => {
			const current = this.sdtcmService.getDisplay();
			this.sdtcmService.setDisplay({ ...current, links: checked });
		}, () => this.sdtcmService.getDisplay().links);
		for (const kind of ['type', 'operation', 'value', 'source'] as const) {
			this._addToggle(filters, kind, display.kinds.has(kind), checked => this._toggleKind(kind, checked), () => this.sdtcmService.getDisplay().kinds.has(kind));
		}
		for (const form of ['declare', 'apply'] as const) {
			this._addToggle(filters, form, display.forms.has(form), checked => this._toggleForm(form, checked), () => this.sdtcmService.getDisplay().forms.has(form));
		}
		root.appendChild(hint);
		root.appendChild(button);
		root.appendChild(toolsTitle);
		root.appendChild(tools);
		root.appendChild(tagHost);
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
		root.appendChild(focusHost);
		container.appendChild(root);
	}

	private _tagRow(tag: IDroxSdtcmTag, shown: boolean, store: DisposableStore): HTMLElement {
		const row = $('div.drox-sdtcm-tag-row');
		const box = $('input') as HTMLInputElement;
		box.type = 'checkbox';
		box.checked = shown;
		box.title = localize('drox.sdtcm.showTag', 'Show');
		store.add(addDisposableListener(box, 'change', () => {
			const current = this.sdtcmService.getDisplay();
			const visibleTags = new Set(current.visibleTags);
			if (box.checked) {
				visibleTags.add(tag.name);
			} else {
				visibleTags.delete(tag.name);
			}
			this.sdtcmService.setDisplay({ ...current, visibleTags });
		}));
		const name = $('span');
		name.textContent = `${tag.name} · ${tag.scope}`;
		name.title = tag.description;
		const color = $('input') as HTMLInputElement;
		color.type = 'color';
		color.value = tag.color;
		store.add(addDisposableListener(color, 'change', () => {
			const tags = this.sdtcmService.getSnapshot().tags.map(item => item.name === tag.name ? { ...item, color: color.value } : item);
			this.sdtcmService.setTags(tags);
		}));
		const remove = $('button.drox-sdtcm-focus-remove');
		remove.textContent = localize('drox.sdtcm.removeTag', 'Remove');
		store.add(addDisposableListener(remove, 'click', () => {
			this.sdtcmService.setTags(this.sdtcmService.getSnapshot().tags.filter(item => item.name !== tag.name));
		}));
		row.appendChild(box);
		row.appendChild(color);
		row.appendChild(name);
		row.appendChild(remove);
		return row;
	}

	private _addToggle(parent: HTMLElement, label: string, checked: boolean, onChange: (checked: boolean) => void, read?: () => boolean): void {
		const row = $('label');
		const box = $('input') as HTMLInputElement;
		box.type = 'checkbox';
		box.checked = checked;
		if (read) {
			this._register(this.sdtcmService.onDidChangeDisplay(() => {
				box.checked = read();
			}));
		}
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

const DROX_SDTCM_TAG_COLORS = ['#c4a574', '#7dcea0', '#d08989', '#8eb4d4', '#b79ad4', '#c8c8c8'];
