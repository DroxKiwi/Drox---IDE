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
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { localize } from '../../../../../nls.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { DroxCommands } from '../../common/drox.js';
import { isDroxDevFeatureEnabled } from '../../common/droxDevSurface.js';
import { DROX_SDTCM_PROBE_PHASES, DroxSdtcmProbePhase } from '../../common/sdtcm/droxSdtcmConsistency.js';
import { DroxSdtcmForm, DroxSdtcmKind } from '../../common/sdtcm/droxSdtcmMap.js';
import { DROX_SDTCM_NEW_TAG, droxSdtcmTagNameOk, IDroxSdtcmTag } from '../../common/sdtcm/droxSdtcmRole.js';
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
		@IHoverService protected override readonly hoverService: IHoverService,
		@ICommandService private readonly commandService: ICommandService,
		@IDroxSdtcmService private readonly sdtcmService: IDroxSdtcmService,
		@IProductService private readonly productService: IProductService,
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
		button.setAttribute('data-drox-tour', 'sdtcm-open');
		button.textContent = localize('drox.sdtcm.sideOpen', 'Open the map');
		this._register(addDisposableListener(button, 'click', () => {
			void this.commandService.executeCommand(DroxCommands.OpenSdtcm);
		}));
		const scopeTitle = $('div.drox-sdtcm-side-label');
		scopeTitle.textContent = localize('drox.sdtcm.mapRoot', 'Map root');
		const scopeHint = $('p.drox-sdtcm-side-hint');
		scopeHint.textContent = localize('drox.sdtcm.mapRootHint', 'Pick folders. The whole map stays visible and the rest is dimmed. The next run only reads those folders.');
		const scopeForm = $('div.drox-sdtcm-root');
		scopeForm.setAttribute('data-drox-tour', 'sdtcm-root');
		const scopeButton = $('button.drox-sdtcm-root-current') as HTMLButtonElement;
		scopeButton.type = 'button';
		const scopeMenu = $('div.drox-sdtcm-root-menu');
		scopeMenu.hidden = true;
		const scopeSearch = $('input') as HTMLInputElement;
		scopeSearch.type = 'text';
		scopeSearch.placeholder = localize('drox.sdtcm.mapRootSearch', 'Folder name, or ./src');
		const scopeList = $('div.drox-sdtcm-root-list');
		const scopeChosen = $('div.drox-sdtcm-root-chosen');
		scopeChosen.hidden = true;
		const chosenUi = this._register(new DisposableStore());
		const scopeError = $('p.drox-sdtcm-side-hint');
		scopeError.hidden = true;
		const wholeFolder = localize('drox.sdtcm.mapRootWhole', 'whole folder');
		const paintCurrent = () => {
			const snapshot = this.sdtcmService.getSnapshot();
			const running = snapshot.phase === 'running';
			scopeButton.disabled = running;
			scopeSearch.disabled = running;
			const roots = snapshot.mapRoots;
			const label = !roots.length ? wholeFolder : roots.length === 1 ? roots[0]! : localize('drox.sdtcm.mapRootCount', '{0} folders', roots.length);
			const count = roots.length === 1 ? snapshot.folders.find(folder => folder.path === roots[0])?.files : snapshot.folders.find(folder => folder.path === '')?.files;
			scopeButton.textContent = roots.length > 1 || count === undefined ? label : `${count}  ${label}`;
		};
		const paintChosen = () => {
			chosenUi.clear();
			clearNode(scopeChosen);
			const snapshot = this.sdtcmService.getSnapshot();
			const roots = snapshot.mapRoots;
			const running = snapshot.phase === 'running';
			scopeChosen.hidden = roots.length === 0;
			if (!roots.length) {
				return;
			}
			const clear = $('button.drox-sdtcm-side-open') as HTMLButtonElement;
			clear.type = 'button';
			clear.disabled = running;
			clear.textContent = localize('drox.sdtcm.mapRootClear', 'Remove all');
			chosenUi.add(addDisposableListener(clear, 'click', () => {
				void this.sdtcmService.setMapRoots([]).then(message => {
					scopeError.hidden = message.length === 0;
					scopeError.textContent = message;
				});
			}));
			scopeChosen.appendChild(clear);
			for (const path of roots) {
				const row = $('div.drox-sdtcm-focus-row');
				const name = $('span.drox-sdtcm-focus-name');
				name.textContent = path;
				name.title = path;
				const remove = $('button.drox-sdtcm-focus-remove') as HTMLButtonElement;
				remove.type = 'button';
				remove.disabled = running;
				remove.textContent = localize('drox.sdtcm.removeFocus', 'Remove');
				chosenUi.add(addDisposableListener(remove, 'click', () => {
					const next = this.sdtcmService.getMapRoots().filter(item => item !== path);
					void this.sdtcmService.setMapRoots(next).then(message => {
						scopeError.hidden = message.length === 0;
						scopeError.textContent = message;
					});
				}));
				row.appendChild(name);
				row.appendChild(remove);
				scopeChosen.appendChild(row);
			}
		};
		const paintList = () => {
			clearNode(scopeList);
			const snapshot = this.sdtcmService.getSnapshot();
			const raw = scopeSearch.value.trim();
			const rooted = raw.startsWith('./') || raw.startsWith('.\\');
			const query = (rooted ? raw.slice(2) : raw).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
			const rows = snapshot.folders.filter(folder => {
				if (!query && !rooted) {
					return true;
				}
				if (!folder.path) {
					return !rooted && wholeFolder.toLowerCase().includes(query);
				}
				const path = folder.path.toLowerCase();
				if (!rooted) {
					return path.includes(query);
				}
				if (!query) {
					return !path.includes('/');
				}
				return path === query || path.startsWith(`${query}/`);
			});
			const ranked = rooted
				? [...rows].sort((a, b) => {
					const exact = (path: string) => path.toLowerCase() === query ? 0 : 1;
					const byExact = exact(a.path) - exact(b.path);
					if (byExact !== 0) {
						return byExact;
					}
					const depth = (path: string) => path ? path.split('/').length : 0;
					const byDepth = depth(a.path) - depth(b.path);
					if (byDepth !== 0) {
						return byDepth;
					}
					return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
				})
				: rows;
			for (const folder of ranked.slice(0, 80)) {
				const row = $('button.drox-sdtcm-root-row') as HTMLButtonElement;
				row.type = 'button';
				row.setAttribute('data-path', folder.path);
				const picked = folder.path.length === 0 ? snapshot.mapRoots.length === 0 : snapshot.mapRoots.includes(folder.path);
				if (picked) {
					row.classList.add('picked');
				}
				const count = $('span.drox-sdtcm-root-count');
				count.textContent = String(folder.files);
				const name = $('span.drox-sdtcm-root-path');
				name.textContent = folder.path || wholeFolder;
				row.appendChild(count);
				row.appendChild(name);
				scopeList.appendChild(row);
			}
			if (!rows.length) {
				const empty = $('p.drox-sdtcm-side-hint');
				empty.textContent = snapshot.folders.length
					? localize('drox.sdtcm.mapRootNone', 'No folder matches.')
					: localize('drox.sdtcm.mapRootWait', 'Indexing the folder…');
				scopeList.appendChild(empty);
			} else if (ranked.length > 80) {
				const more = $('p.drox-sdtcm-side-hint');
				more.textContent = localize('drox.sdtcm.mapRootMore', 'Keep typing to narrow the list.');
				scopeList.appendChild(more);
			}
		};
		const closeMenu = () => {
			scopeMenu.hidden = true;
		};
		this._register(addDisposableListener(scopeButton, 'click', () => {
			scopeMenu.hidden = !scopeMenu.hidden;
			if (!scopeMenu.hidden) {
				scopeSearch.value = '';
				paintList();
				scopeSearch.focus();
			}
		}));
		this._register(addDisposableListener(scopeSearch, 'input', paintList));
		this._register(addDisposableListener(scopeSearch, 'keydown', event => {
			if (event.key === 'Escape') {
				event.preventDefault();
				closeMenu();
				scopeButton.focus();
			}
		}));
		this._register(addDisposableListener(scopeList, 'click', event => {
			const row = (event.target as HTMLElement | null)?.closest('[data-path]');
			if (!row) {
				return;
			}
			const path = row.getAttribute('data-path') ?? '';
			const current = this.sdtcmService.getMapRoots();
			const next = path.length === 0
				? []
				: current.includes(path)
					? current.filter(item => item !== path)
					: [...current, path].sort();
			void this.sdtcmService.setMapRoots(next).then(message => {
				scopeError.hidden = message.length === 0;
				scopeError.textContent = message;
				paintCurrent();
				if (!path.length) {
					closeMenu();
				} else {
					paintList();
				}
			});
		}));
		this._register(addDisposableListener(window, 'pointerdown', event => {
			if (scopeMenu.hidden || scopeForm.contains(event.target as Node)) {
				return;
			}
			closeMenu();
		}));
		this._register(this.sdtcmService.onDidChange(() => {
			paintCurrent();
			paintChosen();
			if (!scopeMenu.hidden) {
				paintList();
			}
		}));
		paintCurrent();
		paintChosen();
		scopeMenu.appendChild(scopeSearch);
		scopeMenu.appendChild(scopeList);
		scopeForm.appendChild(scopeButton);
		scopeForm.appendChild(scopeMenu);
		scopeForm.appendChild(scopeChosen);
		const toolsTitle = $('div.drox-sdtcm-side-label');
		toolsTitle.textContent = localize('drox.sdtcm.tools', 'Tools');
		const tools = $('div.drox-sdtcm-filters');
		const moveRow = $('div');
		moveRow.setAttribute('data-drox-tour', 'sdtcm-tools');
		tools.appendChild(moveRow);
		const display = this.sdtcmService.getDisplay();
		this._addToggle(moveRow, localize('drox.sdtcm.move', 'Move'), display.move, checked => {
			const current = this.sdtcmService.getDisplay();
			this.sdtcmService.setDisplay({ ...current, move: checked });
		}, () => this.sdtcmService.getDisplay().move);
		if (isDroxDevFeatureEnabled('sdtcmConsistency', this.productService)) {
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
		}
		const tagHost = $('div.drox-sdtcm-tags');
		tagHost.setAttribute('data-drox-tour', 'sdtcm-tags');
		const tagUi = this._register(new DisposableStore());
		let tagStamp = '';
		const renderTags = () => {
			const listed = this.sdtcmService.getSnapshot().tags;
			const shown = [...this.sdtcmService.getDisplay().visibleTags].sort().join('\n');
			const stamp = `${shown}|${listed.map(tag => `${tag.name}\u0000${tag.description}\u0000${tag.color}\u0000${tag.scope}\u0000${tag.enabled === false ? '0' : '1'}`).join('\n')}`;
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
			const add = $('button.drox-sdtcm-side-open') as HTMLButtonElement;
			add.type = 'button';
			add.textContent = localize('drox.sdtcm.addTag', 'Add');
			const refusal = $('p.drox-sdtcm-side-hint');
			refusal.hidden = true;
			tagUi.add(addDisposableListener(add, 'click', () => {
				const name = nameInput.value.trim();
				const description = descriptionInput.value.trim();
				const scope = scopeInput.value === 'folder' || scopeInput.value === 'file' || scopeInput.value === 'data' ? scopeInput.value : 'brick';
				const tags = this.sdtcmService.getSnapshot().tags;
				const reason = !droxSdtcmTagNameOk(name)
					? localize('drox.sdtcm.tagNameRule', 'Name starts with a letter, then letters, digits, or hyphens.')
					: !description
						? localize('drox.sdtcm.tagNeedsDescription', 'A description is required.')
						: tags.some(tag => tag.name === name)
							? localize('drox.sdtcm.tagNameTaken', 'That name is already used.')
							: '';
				refusal.hidden = reason.length === 0;
				refusal.textContent = reason;
				if (reason) {
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
			tagHost.appendChild(refusal);
			const visible = this.sdtcmService.getDisplay().visibleTags;
			for (const tag of this.sdtcmService.getSnapshot().tags) {
				tagHost.appendChild(this._tagRow(tag, visible.has(tag.name), tagUi));
			}
		};
		renderTags();
		this._register(this.sdtcmService.onDidChange(() => renderTags()));
		this._register(this.sdtcmService.onDidChangeDisplay(() => renderTags()));
		const filters = $('div.drox-sdtcm-filters');
		filters.setAttribute('data-drox-tour', 'sdtcm-links');
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
		root.appendChild(scopeTitle);
		root.appendChild(scopeHint);
		root.appendChild(scopeForm);
		root.appendChild(scopeError);
		root.appendChild(toolsTitle);
		root.appendChild(tools);
		root.appendChild(tagHost);
		root.appendChild(filters);
		const focusHost = $('div.drox-sdtcm-focus');
		focusHost.setAttribute('data-drox-tour', 'sdtcm-focus');
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
				empty.textContent = localize('drox.sdtcm.noFocus', 'Nothing kept in focus.');
				focusHost.appendChild(empty);
				return;
			}
			const clear = $('button.drox-sdtcm-side-open');
			clear.textContent = localize('drox.sdtcm.removeAllFocus', 'Remove all');
			focusUi.add(addDisposableListener(clear, 'click', () => {
				const current = this.sdtcmService.getDisplay();
				this.sdtcmService.setDisplay({ ...current, focus: [] });
			}));
			focusHost.appendChild(clear);
			for (const id of ids) {
				const row = $('div.drox-sdtcm-focus-row');
				const target = this._focusTarget(id);
				if (!id.startsWith('file:')) {
					const name = $('span.drox-sdtcm-focus-name');
					name.textContent = this._focusName(id);
					name.title = id;
					row.appendChild(name);
				}
				if (target) {
					const path = $('button.drox-sdtcm-focus-path');
					path.textContent = target.line > 1 ? `${target.file}:${target.line}` : target.file;
					path.title = localize('drox.sdtcm.openFocus', 'Open {0}', path.textContent);
					focusUi.add(addDisposableListener(path, 'click', () => {
						void this.commandService.executeCommand(DroxCommands.OpenSdtcm).then(() => {
							this.sdtcmService.reveal(target.file, target.line);
						});
					}));
					row.appendChild(path);
				}
				const remove = $('button.drox-sdtcm-focus-remove');
				remove.textContent = localize('drox.sdtcm.removeFocus', 'Remove');
				focusUi.add(addDisposableListener(remove, 'click', () => {
					const current = this.sdtcmService.getDisplay();
					this.sdtcmService.setDisplay({ ...current, focus: current.focus.filter(item => item !== id) });
				}));
				row.appendChild(remove);
				focusHost.appendChild(row);
			}
		};
		renderFocus();
		this._register(this.sdtcmService.onDidChangeDisplay(() => renderFocus()));
		root.appendChild(focusHost);
		container.appendChild(root);
	}

	private _focusName(id: string): string {
		const map = this.sdtcmService.getSnapshot().map;
		if (id.startsWith('folder:')) {
			return id.slice('folder:'.length);
		}
		if (id.startsWith('file:')) {
			return id.slice('file:'.length);
		}
		const brick = map.bricks.find(item => item.id === id);
		if (brick) {
			return brick.name;
		}
		const data = map.data.find(item => item.id === id);
		if (data) {
			return data.name;
		}
		return id;
	}

	private _focusTarget(id: string): { file: string; line: number } | undefined {
		const map = this.sdtcmService.getSnapshot().map;
		if (id.startsWith('folder:')) {
			return undefined;
		}
		if (id.startsWith('file:')) {
			return { file: id.slice('file:'.length), line: 1 };
		}
		const brick = map.bricks.find(item => item.id === id);
		if (brick) {
			return { file: brick.file, line: brick.line };
		}
		const data = map.data.find(item => item.id === id);
		if (data) {
			return { file: data.file, line: data.line };
		}
		return undefined;
	}

	private _tagRow(tag: IDroxSdtcmTag, shown: boolean, store: DisposableStore): HTMLElement {
		const locked = tag.name === DROX_SDTCM_NEW_TAG || tag.locked === true;
		const row = $('div.drox-sdtcm-tag-row');
		const box = $('input') as HTMLInputElement;
		box.type = 'checkbox';
		box.checked = locked ? tag.enabled !== false : shown;
		box.title = locked
			? localize('drox.sdtcm.tagEnabled', 'Use this tag')
			: localize('drox.sdtcm.showTag', 'Show');
		store.add(addDisposableListener(box, 'change', () => {
			if (locked) {
				const tags = this.sdtcmService.getSnapshot().tags.map(item => item.name === tag.name ? { ...item, enabled: box.checked } : item);
				this.sdtcmService.setTags(tags);
				return;
			}
			const current = this.sdtcmService.getDisplay();
			const visibleTags = new Set(current.visibleTags);
			if (box.checked) {
				visibleTags.add(tag.name);
			} else {
				visibleTags.delete(tag.name);
			}
			this.sdtcmService.setDisplay({ ...current, visibleTags });
		}));
		const name = $('span.drox-sdtcm-tag-name');
		name.textContent = `${tag.name} · ${tag.scope}`;
		name.title = tag.description;
		store.add(this.hoverService.setupDelayedHover(name, { content: tag.description }));
		const color = $('input') as HTMLInputElement;
		color.type = 'color';
		color.value = tag.color;
		store.add(addDisposableListener(color, 'change', () => {
			const tags = this.sdtcmService.getSnapshot().tags.map(item => item.name === tag.name ? { ...item, color: color.value } : item);
			this.sdtcmService.setTags(tags);
		}));
		row.appendChild(box);
		row.appendChild(color);
		if (locked) {
			row.appendChild(name);
			return row;
		}
		const edit = $('button.drox-sdtcm-focus-remove') as HTMLButtonElement;
		edit.type = 'button';
		edit.textContent = localize('drox.sdtcm.editTag', 'Edit');
		store.add(addDisposableListener(edit, 'click', () => this._editTag(row, tag, store)));
		row.appendChild(name);
		row.appendChild(edit);
		const remove = $('button.drox-sdtcm-focus-remove');
		remove.textContent = localize('drox.sdtcm.removeTag', 'Remove');
		store.add(addDisposableListener(remove, 'click', () => {
			this.sdtcmService.setTags(this.sdtcmService.getSnapshot().tags.filter(item => item.name !== tag.name));
		}));
		row.appendChild(remove);
		return row;
	}

	private _editTag(row: HTMLElement, tag: IDroxSdtcmTag, store: DisposableStore): void {
		const locked = tag.name === DROX_SDTCM_NEW_TAG || tag.locked === true;
		const editor = new DisposableStore();
		store.add(editor);
		clearNode(row);
		row.classList.add('editing');
		const nameInput = $('input') as HTMLInputElement;
		nameInput.type = 'text';
		nameInput.value = tag.name;
		nameInput.maxLength = 32;
		nameInput.disabled = locked;
		const descriptionInput = $('input') as HTMLInputElement;
		descriptionInput.type = 'text';
		descriptionInput.value = tag.description;
		descriptionInput.maxLength = 240;
		const scopeInput = $('select') as HTMLSelectElement;
		for (const scope of ['folder', 'file', 'brick', 'data'] as const) {
			const option = $('option') as HTMLOptionElement;
			option.value = scope;
			option.textContent = scope;
			scopeInput.appendChild(option);
		}
		scopeInput.value = tag.scope;
		scopeInput.disabled = locked;
		const save = $('button.drox-sdtcm-focus-remove') as HTMLButtonElement;
		save.type = 'button';
		save.textContent = localize('drox.sdtcm.saveTag', 'Save');
		const cancel = $('button.drox-sdtcm-focus-remove') as HTMLButtonElement;
		cancel.type = 'button';
		cancel.textContent = localize('drox.sdtcm.cancelTag', 'Cancel');
		const hint = $('p.drox-sdtcm-side-hint');
		hint.hidden = true;
		const close = () => {
			editor.dispose();
			const current = this.sdtcmService.getSnapshot().tags.find(item => item.name === tag.name) ?? tag;
			const replacement = this._tagRow(current, this.sdtcmService.getDisplay().visibleTags.has(current.name), store);
			row.replaceWith(replacement);
		};
		editor.add(addDisposableListener(save, 'click', () => {
			const scope = scopeInput.value === 'folder' || scopeInput.value === 'file' || scopeInput.value === 'data' ? scopeInput.value : 'brick';
			const reason = this.sdtcmService.updateTag(tag.name, {
				name: nameInput.value,
				description: descriptionInput.value,
				scope,
			});
			hint.hidden = reason.length === 0;
			hint.textContent = reason;
			if (!reason) {
				close();
			}
		}));
		editor.add(addDisposableListener(cancel, 'click', close));
		row.appendChild(nameInput);
		row.appendChild(descriptionInput);
		row.appendChild(scopeInput);
		row.appendChild(save);
		row.appendChild(cancel);
		row.appendChild(hint);
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
