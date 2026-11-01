/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import './media/droxSdtcm.css';
import { $, addDisposableListener, clearNode, Dimension } from '../../../../../base/browser/dom.js';
import { Orientation, Sash, SashState } from '../../../../../base/browser/ui/sash/sash.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { DisposableStore, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IEditorConstructionOptions } from '../../../../../editor/browser/config/editorConfiguration.js';
import { CodeEditorWidget } from '../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js';
import { IEditorOptions as ICodeOptions } from '../../../../../editor/common/config/editorOptions.js';
import { ITextModelService, IResolvedTextEditorModel } from '../../../../../editor/common/services/resolverService.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { isDroxDevFeatureEnabled } from '../../common/droxDevSurface.js';
import { buildDroxSdtcmGraph, IDroxSdtcmGraph, IDroxSdtcmGraphNode } from '../../common/sdtcm/droxSdtcmGraph.js';
import { markDroxSdtcmFocus } from '../../common/sdtcm/focus/droxSdtcmFocus.js';
import { mostLinkedDroxSdtcmFolderId } from '../../common/sdtcm/placement/droxSdtcmFolderLinks.js';
import { DroxSdtcmPlacementMode, placeDroxSdtcmGraph, shiftDroxSdtcmFolders, stepDroxSdtcmLinkPull } from '../../common/sdtcm/placement/droxSdtcmPlacement.js';
import { trackDroxSdtcmWeightMotion } from './placement/droxSdtcmWeightLoop.js';
import { formatDroxSdtcmDiscussion } from '../../common/sdtcm/droxSdtcmRole.js';
import { clearDroxSdtcmNode, ensureDroxSdtcmMarker, paintDroxSdtcmGraph } from './droxSdtcmCanvas.js';
import { DROX_SDTCM_EDITOR_ID } from './droxSdtcmInput.js';
import { IDroxSdtcmService, IDroxSdtcmSnapshot } from './droxSdtcmService.js';

export class DroxSdtcmEditor extends EditorPane {

	static readonly ID = DROX_SDTCM_EDITOR_ID;

	private _container: HTMLElement | undefined;
	private _status: HTMLElement | undefined;
	private _step: HTMLElement | undefined;
	private _journal: HTMLElement | undefined;
	private _exchange: HTMLElement | undefined;
	private _json: HTMLElement | undefined;
	private _body: HTMLElement | undefined;
	private _rail: HTMLElement | undefined;
	private _stage: HTMLElement | undefined;
	private _viewport: HTMLElement | undefined;
	private _codeHost: HTMLElement | undefined;
	private _world: SVGGElement | undefined;
	private _codeEditor: CodeEditorWidget | undefined;
	private _modelRef: IReference<IResolvedTextEditorModel> | undefined;
	private _openKey: string | undefined;
	private _openSeq = 0;
	private _railWidth = 420;
	private _codeHeight = 260;
	private _codeOpen = false;
	private _railOpen = true;
	private _placement: DroxSdtcmPlacementMode = 'free';
	private readonly _folderOffset = new Map<string, { x: number; y: number }>();
	private readonly _weightAt = new Map<string, { x: number; y: number }>();
	private _weightKey = '';
	private _drag: { id: string; x: number; y: number; ox: number; oy: number } | undefined;
	private _suppressSelect = false;
	private _press: { node: IDroxSdtcmGraphNode; x: number; y: number } | undefined;
	private _railSash: Sash | undefined;
	private _codeSash: Sash | undefined;
	private _tooltip: HTMLElement | undefined;
	private _card: HTMLElement | undefined;
	private _snapshot: IDroxSdtcmSnapshot | undefined;
	private _selected: string | undefined;
	private _panX = 32;
	private _panY = 32;
	private _zoom = 1;
	private _panning = false;
	private _moved = false;
	private _originX = 0;
	private _originY = 0;
	private _panStartX = 0;
	private _panStartY = 0;
	private readonly _markerId: string;
	private readonly _ui = this._register(new DisposableStore());
	private readonly _menuUi = this._register(new DisposableStore());
	private _menu: HTMLElement | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IDroxSdtcmService private readonly sdtcmService: IDroxSdtcmService,
		@IProductService private readonly productService: IProductService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@IEditorService private readonly editorService: IEditorService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(DroxSdtcmEditor.ID, group, telemetryService, themeService, storageService);
		this._markerId = `sdtcmArrow${group.id}`;
	}

	protected createEditor(parent: HTMLElement): void {
		this._container = $('div.drox-sdtcm');
		const toolbar = $('div.drox-sdtcm-toolbar');
		const live = $('div.drox-sdtcm-live');
		live.appendChild($('span.drox-sdtcm-dot'));
		this._status = $('div.drox-sdtcm-status');
		this._step = $('div.drox-sdtcm-step');
		live.appendChild(this._status);
		live.appendChild(this._step);
		const stop = $('button.drox-sdtcm-side-open');
		stop.textContent = localize('drox.sdtcm.stop', 'Stop');
		const resume = $('button.drox-sdtcm-side-open');
		resume.textContent = localize('drox.sdtcm.resume', 'Run again');
		const align = $('button.drox-sdtcm-side-open');
		align.textContent = localize('drox.sdtcm.align', 'Realign');
		const zoomOut = $('button.drox-sdtcm-side-open');
		zoomOut.textContent = '−';
		const zoomIn = $('button.drox-sdtcm-side-open');
		zoomIn.textContent = '+';
		this._ui.add(addDisposableListener(stop, 'click', () => this.sdtcmService.stop()));
		this._ui.add(addDisposableListener(resume, 'click', () => { void this.sdtcmService.resume(); }));
		this._ui.add(addDisposableListener(align, 'click', () => {
			const folder = this.workspaceService.getWorkspace().folders[0]?.uri;
			if (folder) {
				void this.sdtcmService.align(folder);
			}
		}));
		this._ui.add(addDisposableListener(zoomOut, 'click', () => this._setZoom(this._zoom / 1.15)));
		this._ui.add(addDisposableListener(zoomIn, 'click', () => this._setZoom(this._zoom * 1.15)));
		toolbar.appendChild(stop);
		toolbar.appendChild(resume);
		toolbar.appendChild(align);
		toolbar.appendChild(zoomOut);
		toolbar.appendChild(zoomIn);
		this._journal = $('div.drox-sdtcm-journal');
		this._viewport = $('div.drox-sdtcm-viewport');
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'drox-sdtcm-svg');
		this._world = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		ensureDroxSdtcmMarker(svg, this._markerId);
		svg.appendChild(this._world);
		this._tooltip = $('div.drox-sdtcm-tooltip');
		this._tooltip.hidden = true;
		this._card = $('div.drox-sdtcm-card');
		this._card.hidden = true;
		this._viewport.appendChild(svg);
		this._viewport.appendChild(this._tooltip);
		this._bindPointer(this._viewport);
		this._codeHost = $('div.drox-sdtcm-code');
		this._codeHost.hidden = true;
		const configured = this.configurationService.getValue<ICodeOptions>('editor') ?? {};
		const editorOptions: IEditorConstructionOptions = {
			...configured,
			readOnly: false,
			automaticLayout: false,
			fixedOverflowWidgets: true,
			overflowWidgetsDomNode: this._container,
			scrollbar: { vertical: 'auto', horizontal: 'auto', alwaysConsumeMouseWheel: true },
		};
		this._codeEditor = this._ui.add(this.instantiationService.createInstance(CodeEditorWidget, this._codeHost, editorOptions, {}));
		const body = $('div.drox-sdtcm-body');
		const main = $('div.drox-sdtcm-main');
		const stage = $('div.drox-sdtcm-stage');
		stage.appendChild(this._viewport);
		stage.appendChild(this._codeHost);
		main.appendChild(this._journal);
		main.appendChild(stage);
		main.appendChild(this._card);
		this._body = body;
		this._stage = stage;
		const rail = $('aside.drox-sdtcm-rail');
		this._rail = rail;
		const exchangeTitle = $('div.drox-sdtcm-rail-title');
		const exchangeLabel = $('span.drox-sdtcm-rail-label');
		exchangeLabel.textContent = localize('drox.sdtcm.exchange', 'Exchange');
		const railToggle = $('button.drox-sdtcm-rail-toggle') as HTMLButtonElement;
		const railGlyph = $('span');
		railGlyph.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));
		railToggle.appendChild(railGlyph);
		railToggle.ariaLabel = localize('drox.sdtcm.hideRail', 'Hide');
		railToggle.setAttribute('aria-expanded', 'true');
		this._ui.add(addDisposableListener(railToggle, 'click', () => {
			this._railOpen = !this._railOpen;
			rail.classList.toggle('collapsed', !this._railOpen);
			railGlyph.className = '';
			railGlyph.classList.add(...ThemeIcon.asClassNameArray(this._railOpen ? Codicon.chevronRight : Codicon.chevronLeft));
			railToggle.ariaLabel = this._railOpen
				? localize('drox.sdtcm.hideRail', 'Hide')
				: localize('drox.sdtcm.showRail', 'Show');
			railToggle.setAttribute('aria-expanded', String(this._railOpen));
			this._applySplits();
		}));
		exchangeTitle.appendChild(exchangeLabel);
		exchangeTitle.appendChild(railToggle);
		if (isDroxDevFeatureEnabled('sdtcmExport', this.productService)) {
			const exportButton = $('button.drox-sdtcm-export');
			exportButton.textContent = localize('drox.sdtcm.export', 'Export');
			exportButton.title = localize('drox.sdtcm.exportTitle', 'Saves the full discussion, including the system prompt and injections.');
			this._ui.add(addDisposableListener(exportButton, 'click', () => { void this._exportDiscussion(); }));
			exchangeTitle.appendChild(exportButton);
		}
		this._exchange = $('div.drox-sdtcm-exchange');
		const jsonTitle = $('div.drox-sdtcm-rail-title');
		jsonTitle.textContent = 'map.json';
		this._json = $('pre.drox-sdtcm-json');
		const railBody = $('div.drox-sdtcm-rail-body');
		railBody.appendChild(this._exchange);
		railBody.appendChild(jsonTitle);
		railBody.appendChild(this._json);
		rail.appendChild(exchangeTitle);
		rail.appendChild(railBody);
		body.appendChild(main);
		body.appendChild(rail);
		this._container.appendChild(toolbar);
		this._container.appendChild(live);
		this._container.appendChild(body);
		parent.appendChild(this._container);
		this._bindSplits();
		this._applySplits();
		this._applyTransform();
		this._ui.add(this.sdtcmService.onDidChange(snapshot => this._render(snapshot)));
		this._ui.add(this.sdtcmService.onDidChangeDisplay(() => {
			const placement = this.sdtcmService.getDisplay().placement;
			if (placement !== this._placement) {
				this._placement = placement;
				this._folderOffset.clear();
				this._weightAt.clear();
				this._weightKey = '';
				this._drag = undefined;
			}
			this._paint();
		}));
		trackDroxSdtcmWeightMotion(this._ui, () => {
			const display = this.sdtcmService.getDisplay();
			if (display.placement !== 'weight' || !this._snapshot) {
				return;
			}
			const built = buildDroxSdtcmGraph(this._snapshot.map, this._snapshot.files, display);
			this._seedWeight(built, display.attraction);
			if (stepDroxSdtcmLinkPull(this._weightAt, built, display.attraction, this._drag?.id)) {
				this._paint();
			}
		});
	}

	override dispose(): void {
		this._openSeq++;
		this._codeEditor?.setModel(null);
		this._modelRef?.dispose();
		this._modelRef = undefined;
		super.dispose();
	}

	override async setInput(input: EditorInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		const folder = this.workspaceService.getWorkspace().folders[0]?.uri;
		if (!folder) {
			this._render({
				phase: 'idle',
				mode: 'none',
				message: localize('drox.sdtcm.noFolder', 'Open a folder to build the map.'),
				step: 0,
				maxSteps: 0,
				journal: [],
				exchanges: [],
				map: { version: 1, entry: null, bricks: [], data: [] },
				files: [],
			});
			return;
		}
		await this.sdtcmService.open(folder);
		this._render(this.sdtcmService.getSnapshot());
	}

	override layout(dimension: Dimension): void {
		if (this._container) {
			this._container.style.height = `${dimension.height}px`;
			this._container.style.width = `${dimension.width}px`;
		}
		this._applySplits();
	}

	private _bindPointer(viewport: HTMLElement): void {
		this._ui.add(addDisposableListener(viewport, 'pointerdown', event => {
			if (event.button !== 0) {
				return;
			}
			this._panning = true;
			this._moved = false;
			this._originX = event.clientX;
			this._originY = event.clientY;
			this._panStartX = this._panX;
			this._panStartY = this._panY;
			viewport.classList.add('panning');
		}));
		this._ui.add(addDisposableListener(window, 'pointermove', event => {
			if (this._drag) {
				const dx = (event.clientX - this._drag.x) / this._zoom;
				const dy = (event.clientY - this._drag.y) / this._zoom;
				if (Math.abs(dx) + Math.abs(dy) > 3) {
					this._suppressSelect = true;
				}
				const next = { x: this._drag.ox + dx, y: this._drag.oy + dy };
				if (this.sdtcmService.getDisplay().placement === 'weight') {
					this._weightAt.set(this._drag.id, next);
				} else {
					this._folderOffset.set(this._drag.id, next);
				}
				this._paint();
				return;
			}
			if (!this._panning) {
				return;
			}
			const dx = event.clientX - this._originX;
			const dy = event.clientY - this._originY;
			if (Math.abs(dx) + Math.abs(dy) > 3) {
				this._moved = true;
			}
			this._panX = this._panStartX + dx;
			this._panY = this._panStartY + dy;
			this._applyTransform();
		}));
		this._ui.add(addDisposableListener(window, 'pointerup', event => {
			const press = this._press;
			this._press = undefined;
			if (press && Math.abs(event.clientX - press.x) + Math.abs(event.clientY - press.y) <= 4) {
				this._suppressSelect = true;
				this._select(press.node);
				const suppress = this._suppressSelect;
				setTimeout(() => {
					if (this._suppressSelect === suppress) {
						this._suppressSelect = false;
					}
				}, 0);
			}
			if (this._drag) {
				this._drag = undefined;
				const suppress = this._suppressSelect;
				setTimeout(() => {
					if (this._suppressSelect === suppress) {
						this._suppressSelect = false;
					}
				}, 0);
				return;
			}
			if (!this._panning) {
				return;
			}
			const clear = !this._moved;
			this._panning = false;
			viewport.classList.remove('panning');
			if (clear) {
				this._selected = undefined;
				this._hideCard();
				this._paint();
			}
		}));
		const onWheel = (event: WheelEvent) => {
			event.preventDefault();
			const rect = viewport.getBoundingClientRect();
			const px = event.clientX - rect.left;
			const py = event.clientY - rect.top;
			const next = clamp(this._zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
			const ratio = next / this._zoom;
			this._panX = px - ratio * (px - this._panX);
			this._panY = py - ratio * (py - this._panY);
			this._zoom = next;
			this._applyTransform();
		};
		viewport.addEventListener('wheel', onWheel, { passive: false });
		this._ui.add(toDisposable(() => viewport.removeEventListener('wheel', onWheel)));
	}

	private _render(snapshot: IDroxSdtcmSnapshot): void {
		if (!this._status || !this._journal || !this._step || !this._container) {
			return;
		}
		this._snapshot = snapshot;
		this._container.classList.toggle('running', snapshot.phase === 'running');
		this._container.classList.toggle('error', snapshot.phase === 'error');
		this._status.textContent = snapshot.message;
		this._step.textContent = snapshot.phase === 'running' && snapshot.maxSteps
			? localize('drox.sdtcm.step', 'Turn {0}/{1}', snapshot.step, snapshot.maxSteps)
			: '';
		clearNode(this._journal);
		for (const line of snapshot.journal) {
			const row = $('div.drox-sdtcm-journal-line');
			row.textContent = line;
			this._journal.appendChild(row);
		}
		this._journal.scrollTop = this._journal.scrollHeight;
		this._renderExchange(snapshot);
		this._renderJson(snapshot);
		this._paint();
	}

	private async _exportDiscussion(): Promise<void> {
		const folder = this.workspaceService.getWorkspace().folders[0]?.uri;
		const exchanges = this.sdtcmService.getSnapshot().exchanges;
		if (!folder || !exchanges.length) {
			this.notificationService.info(localize('drox.sdtcm.exportEmpty', 'No discussion to export.'));
			return;
		}
		try {
			const text = formatDroxSdtcmDiscussion(exchanges);
			const dir = URI.joinPath(folder, '.drox', 'exports');
			const stamp = new Date().toISOString().replace(/[:.]/g, '-');
			const file = URI.joinPath(dir, `sdtcm-discussion-${stamp}.txt`);
			await this.fileService.createFolder(dir);
			const bytes = VSBuffer.fromString(text);
			await this.fileService.writeFile(file, bytes);
			await this.fileService.writeFile(URI.joinPath(dir, 'sdtcm-discussion.txt'), bytes);
			await this.editorService.openEditor({ resource: file, options: { pinned: false } });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.notificationService.error(localize('drox.sdtcm.exportFailed', 'Export failed: {0}', message));
		}
	}

	private _renderExchange(snapshot: IDroxSdtcmSnapshot): void {
		if (!this._exchange) {
			return;
		}
		const nearEnd = this._exchange.scrollTop + this._exchange.clientHeight >= this._exchange.scrollHeight - 12;
		clearNode(this._exchange);
		for (const item of snapshot.exchanges) {
			const turn = $('div.drox-sdtcm-turn');
			turn.classList.add(item.role);
			const name = $('div.drox-sdtcm-bubble-name');
			name.textContent = item.role === 'engine' ? localize('drox.sdtcm.engine', 'Engine') : localize('drox.sdtcm.agent', 'Agent');
			const bubble = $('div.drox-sdtcm-bubble');
			bubble.textContent = item.text;
			turn.appendChild(name);
			turn.appendChild(bubble);
			this._exchange.appendChild(turn);
		}
		if (nearEnd) {
			this._exchange.scrollTop = this._exchange.scrollHeight;
		}
	}

	private _renderJson(snapshot: IDroxSdtcmSnapshot): void {
		if (!this._json) {
			return;
		}
		const json = JSON.stringify(snapshot.map, null, 2);
		if (this._json.textContent === json) {
			return;
		}
		const nearEnd = this._json.scrollTop + this._json.clientHeight >= this._json.scrollHeight - 12;
		this._json.textContent = json;
		if (nearEnd) {
			this._json.scrollTop = this._json.scrollHeight;
		}
	}

	centerOnMostLinked(): void {
		const graph = this._placedGraph();
		const viewport = this._viewport;
		if (!graph || !viewport) {
			return;
		}
		const hubId = mostLinkedDroxSdtcmFolderId(graph);
		const hub = hubId ? graph.nodes.find(node => node.id === hubId) : undefined;
		if (!hub || viewport.clientWidth <= 0 || viewport.clientHeight <= 0) {
			return;
		}
		this._panX = viewport.clientWidth / 2 - this._zoom * (hub.x + hub.w / 2);
		this._panY = viewport.clientHeight / 2 - this._zoom * (hub.y + hub.h / 2);
		this._applyTransform();
	}

	private _placedGraph(): IDroxSdtcmGraph | undefined {
		if (!this._snapshot) {
			return undefined;
		}
		const display = this.sdtcmService.getDisplay();
		const built = buildDroxSdtcmGraph(this._snapshot.map, this._snapshot.files, display);
		return display.placement === 'weight'
			? shiftDroxSdtcmFolders(built, this._seedWeight(built, display.attraction))
			: shiftDroxSdtcmFolders(placeDroxSdtcmGraph(built, 'free'), this._folderOffset);
	}

	private _paint(): void {
		if (!this._world || !this._viewport || !this._snapshot) {
			return;
		}
		const display = this.sdtcmService.getDisplay();
		const graph = this._placedGraph();
		if (!graph) {
			return;
		}
		if (this._selected && !graph.nodes.some(node => node.id === this._selected)) {
			this._selected = undefined;
			this._hideCard();
		}
		if (!graph.nodes.length) {
			clearDroxSdtcmNode(this._world);
			const empty = $('p.drox-sdtcm-hint');
			empty.textContent = localize('drox.sdtcm.empty', 'No file in the tree.');
			if (!this._viewport.querySelector('.drox-sdtcm-hint')) {
				this._viewport.appendChild(empty);
			}
			return;
		}
		this._viewport.querySelector('.drox-sdtcm-hint')?.remove();
		const focusIds = new Set(display.focus);
		if (this._drag) {
			focusIds.add(this._drag.id);
		}
		paintDroxSdtcmGraph(this._world, this._markerId, graph, this._selected, {
			onEnter: (node, event) => this._showTooltip(node, event),
			onLeave: () => this._hideTooltip(),
			onSelect: node => {
				if (this._suppressSelect) {
					this._suppressSelect = false;
					return;
				}
				this._select(node);
			},
			onPressNode: (node, event) => {
				if (event.button !== 0 || (node.kind !== 'file' && node.kind !== 'brick' && node.kind !== 'data')) {
					return;
				}
				this._press = { node, x: event.clientX, y: event.clientY };
			},
			onGrabFolder: (node, event) => {
				if (event.button !== 0) {
					return;
				}
				const at = this.sdtcmService.getDisplay().placement === 'weight'
					? (this._weightAt.get(node.id) ?? { x: node.x, y: node.y })
					: (this._folderOffset.get(node.id) ?? { x: 0, y: 0 });
				this._drag = { id: node.id, x: event.clientX, y: event.clientY, ox: at.x, oy: at.y };
				this._suppressSelect = false;
				this._paint();
			},
			onFolderMenu: (node, event) => this._openFolderMenu(node.id, event.clientX, event.clientY),
		}, markDroxSdtcmFocus(graph, focusIds));
		this._applyTransform();
	}

	private _openFolderMenu(folderId: string, x: number, y: number): void {
		this._hideFolderMenu();
		const menu = $('div.drox-sdtcm-menu');
		menu.style.left = `${x}px`;
		menu.style.top = `${y}px`;
		const item = $('button');
		item.textContent = localize('drox.sdtcm.keepInFocus', 'Keep in focus');
		this._menuUi.add(addDisposableListener(item, 'click', event => {
			event.stopPropagation();
			const current = this.sdtcmService.getDisplay();
			if (!current.focus.includes(folderId)) {
				this.sdtcmService.setDisplay({ ...current, focus: [...current.focus, folderId] });
			}
			this._hideFolderMenu();
		}));
		this._menuUi.add(addDisposableListener(window, 'pointerdown', event => {
			if (event.target instanceof Node && menu.contains(event.target)) {
				return;
			}
			this._hideFolderMenu();
		}));
		menu.appendChild(item);
		this._container?.appendChild(menu);
		this._menu = menu;
	}

	private _hideFolderMenu(): void {
		this._menuUi.clear();
		this._menu?.remove();
		this._menu = undefined;
	}

	private _seedWeight(graph: IDroxSdtcmGraph, attraction: number): Map<string, { x: number; y: number }> {
		const folders = graph.nodes.filter(node => node.kind === 'folder');
		const key = folders.map(folder => folder.id).sort().join('|');
		if (key !== this._weightKey) {
			this._weightKey = key;
			this._weightAt.clear();
			const placed = placeDroxSdtcmGraph(graph, 'weight', attraction);
			for (const node of placed.nodes) {
				if (node.kind === 'folder') {
					this._weightAt.set(node.id, { x: node.x, y: node.y });
				}
			}
		}
		return this._weightAt;
	}

	private _select(node: IDroxSdtcmGraphNode): void {
		this._selected = node.id;
		this._showCard(node);
		if ((node.kind === 'file' || node.kind === 'brick' || node.kind === 'data') && node.file && typeof node.line === 'number') {
			void this._openBrick(node.file, node.line);
		}
		this._paint();
	}

	private async _openBrick(file: string, line: number): Promise<void> {
		const folder = this.workspaceService.getWorkspace().folders[0]?.uri;
		const editor = this._codeEditor;
		if (!folder || !editor || !this._codeHost) {
			return;
		}
		const seq = ++this._openSeq;
		const resource = URI.joinPath(folder, ...file.split('/').filter(part => part.length > 0));
		const key = resource.toString();
		this._codeOpen = true;
		this._codeHost.hidden = false;
		this._applySplits();
		try {
			if (this._openKey !== key) {
				const ref = await this.textModelService.createModelReference(resource);
				if (seq !== this._openSeq) {
					ref.dispose();
					return;
				}
				this._modelRef?.dispose();
				this._modelRef = ref;
				this._openKey = key;
				editor.setModel(ref.object.textEditorModel);
			}
		} catch (error) {
			if (seq !== this._openSeq) {
				return;
			}
			const message = error instanceof Error ? error.message : String(error);
			this.notificationService.error(message);
			return;
		}
		if (seq !== this._openSeq) {
			return;
		}
		const model = editor.getModel();
		const target = model ? Math.min(Math.max(1, line), model.getLineCount()) : line;
		editor.setPosition({ lineNumber: target, column: 1 });
		editor.revealLineInCenter(target);
		this._layoutCode();
		editor.focus();
	}

	private _bindSplits(): void {
		if (!this._body || !this._stage || !this._rail) {
			return;
		}
		const rail = this._ui.add(new Sash(this._body, {
			getVerticalSashLeft: () => this._body!.clientWidth - this._railWidth,
		}, { orientation: Orientation.VERTICAL, size: 4 }));
		const code = this._ui.add(new Sash(this._stage, {
			getHorizontalSashTop: () => this._codeOpen ? this._stage!.clientHeight - this._codeHeight : this._stage!.clientHeight,
		}, { orientation: Orientation.HORIZONTAL, size: 4 }));
		this._railSash = rail;
		this._codeSash = code;
		let rail0 = this._railWidth;
		let code0 = this._codeHeight;
		this._ui.add(rail.onDidStart(() => { rail0 = this._railWidth; }));
		this._ui.add(rail.onDidChange(event => {
			if (!this._railOpen) {
				return;
			}
			const max = Math.max(260, (this._body?.clientWidth ?? 800) - 280);
			this._railWidth = clampSize(rail0 - (event.currentX - event.startX), 240, max);
			this._applySplits();
		}));
		this._ui.add(code.onDidStart(() => { code0 = this._codeHeight; }));
		this._ui.add(code.onDidChange(event => {
			if (!this._codeOpen) {
				return;
			}
			const max = Math.max(160, (this._stage?.clientHeight ?? 400) - 120);
			this._codeHeight = clampSize(code0 - (event.currentY - event.startY), 140, max);
			this._applySplits();
		}));
	}

	private _applySplits(): void {
		const width = this._railOpen ? this._railWidth : 72;
		if (this._rail) {
			this._rail.style.flex = `0 0 ${width}px`;
			this._rail.style.width = `${width}px`;
		}
		if (this._railSash) {
			this._railSash.state = this._railOpen ? SashState.Enabled : SashState.Disabled;
		}
		if (this._codeHost) {
			this._codeHost.hidden = !this._codeOpen;
			this._codeHost.style.height = this._codeOpen ? `${this._codeHeight}px` : '0px';
		}
		if (this._codeSash) {
			this._codeSash.state = this._codeOpen ? SashState.Enabled : SashState.Disabled;
		}
		this._railSash?.layout();
		this._codeSash?.layout();
		this._layoutCode();
	}

	private _layoutCode(): void {
		if (!this._codeEditor || !this._codeHost || !this._codeOpen) {
			return;
		}
		const width = this._codeHost.clientWidth;
		const height = this._codeHost.clientHeight;
		if (width > 0 && height > 0) {
			this._codeEditor.layout({ width, height });
		}
	}

	private _showTooltip(node: IDroxSdtcmGraphNode, event: MouseEvent): void {
		if (!this._tooltip || !this._viewport) {
			return;
		}
		const rect = this._viewport.getBoundingClientRect();
		this._tooltip.hidden = false;
		this._tooltip.style.left = `${event.clientX - rect.left + 14}px`;
		this._tooltip.style.top = `${event.clientY - rect.top + 14}px`;
		clearNode(this._tooltip);
		for (const line of node.lines) {
			const row = $('div');
			row.textContent = line;
			this._tooltip.appendChild(row);
		}
	}

	private _hideTooltip(): void {
		if (this._tooltip) {
			this._tooltip.hidden = true;
		}
	}

	private _showCard(node: IDroxSdtcmGraphNode): void {
		if (!this._card) {
			return;
		}
		this._card.hidden = false;
		clearNode(this._card);
		for (const line of node.lines) {
			const row = $('div');
			row.textContent = line;
			this._card.appendChild(row);
		}
	}

	private _hideCard(): void {
		if (this._card) {
			this._card.hidden = true;
			clearNode(this._card);
		}
	}

	private _setZoom(zoom: number): void {
		this._zoom = clamp(zoom);
		this._applyTransform();
	}

	private _applyTransform(): void {
		this._world?.setAttribute('transform', `translate(${this._panX} ${this._panY}) scale(${this._zoom})`);
	}
}

function clamp(zoom: number): number {
	return Math.min(2.6, Math.max(0.05, zoom));
}

function clampSize(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
