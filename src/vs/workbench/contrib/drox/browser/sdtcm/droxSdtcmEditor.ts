/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import './media/droxSdtcm.css';
import { $, addDisposableListener, clearNode, Dimension } from '../../../../../base/browser/dom.js';
import { HoverStyle } from '../../../../../base/browser/ui/hover/hover.js';
import { HoverPosition } from '../../../../../base/browser/ui/hover/hoverWidget.js';
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
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { DROX_TOKEN_WARNING_HOVER_CLASS, droxTokenWarningHoverContent } from '../../../../browser/droxTokenWarningHover.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { isDroxDevFeatureEnabled } from '../../common/droxDevSurface.js';
import { buildDroxSdtcmGraph, IDroxSdtcmGraph, IDroxSdtcmGraphNode } from '../../common/sdtcm/droxSdtcmGraph.js';
import { DroxSdtcmPathKind, traceDroxSdtcmSelection } from '../../common/sdtcm/data/droxSdtcmPath.js';
import { markDroxSdtcmFocus, markDroxSdtcmKept } from '../../common/sdtcm/focus/droxSdtcmFocus.js';
import { mostLinkedDroxSdtcmFolderId } from '../../common/sdtcm/placement/droxSdtcmFolderLinks.js';
import { emptyDroxSdtcmMoveHistory, IDroxSdtcmMoveHistory, redoDroxSdtcmMove, rememberDroxSdtcmMove, undoDroxSdtcmMove } from '../../common/sdtcm/placement/droxSdtcmMoveHistory.js';
import { placeDroxSdtcmGraph, shiftDroxSdtcmFolders } from '../../common/sdtcm/placement/droxSdtcmPlacement.js';
import { DROX_SDTCM_PROBE_PHASES, DroxSdtcmProbePhase, expandDroxSdtcmPhases } from '../../common/sdtcm/droxSdtcmConsistency.js';
import { formatDroxSdtcmDiscussion } from '../../common/sdtcm/droxSdtcmRole.js';
import { clearDroxSdtcmNode, paintDroxSdtcmGraph } from './droxSdtcmCanvas.js';
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
	private _codeEditorHost: HTMLElement | undefined;
	private _codeName: HTMLElement | undefined;
	private _world: SVGGElement | undefined;
	private _codeEditor: CodeEditorWidget | undefined;
	private _modelRef: IReference<IResolvedTextEditorModel> | undefined;
	private _openKey: string | undefined;
	private _openSeq = 0;
	private _railWidth = 420;
	private _codeHeight = 260;
	private _codeOpen = false;
	private _railOpen = false;
	private readonly _folderOffset = new Map<string, { x: number; y: number }>();
	private _moves: IDroxSdtcmMoveHistory = emptyDroxSdtcmMoveHistory();
	private _drag: { id: string; x: number; y: number; ox: number; oy: number } | undefined;
	private _suppressSelect = false;
	private _press: { node: IDroxSdtcmGraphNode; x: number; y: number } | undefined;
	private _railSash: Sash | undefined;
	private _codeSash: Sash | undefined;
	private _tooltip: HTMLElement | undefined;
	private _card: HTMLElement | undefined;
	private _snapshot: IDroxSdtcmSnapshot | undefined;
	private _selected: string | undefined;
	private _path: { kind: DroxSdtcmPathKind; id: string } | undefined;
	private _panX = 32;
	private _panY = 32;
	private _zoom = 1;
	private _panning = false;
	private _blankDown = false;
	private _moved = false;
	private _originX = 0;
	private _originY = 0;
	private _panStartX = 0;
	private _panStartY = 0;
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
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super(DroxSdtcmEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this._container = $('div.drox-sdtcm');
		const toolbar = $('div.drox-sdtcm-toolbar');
		toolbar.setAttribute('data-drox-tour', 'sdtcm-header');
		const live = $('div.drox-sdtcm-live');
		live.appendChild($('span.drox-sdtcm-dot'));
		this._status = $('div.drox-sdtcm-status');
		this._step = $('div.drox-sdtcm-step');
		live.appendChild(this._status);
		live.appendChild(this._step);
		const stop = $('button.drox-sdtcm-side-open');
		stop.textContent = localize('drox.sdtcm.stop', 'Stop');
		const phaseRow = $('div.drox-sdtcm-phases');
		phaseRow.title = localize('drox.sdtcm.phaseHint', 'An earlier phase also runs the phases that follow from it.');
		const pick = new Set<DroxSdtcmProbePhase>(this.sdtcmService.getPhasePick());
		const chips = new Map<DroxSdtcmProbePhase, HTMLButtonElement>();
		const resume = $('button.drox-sdtcm-side-open') as HTMLButtonElement;
		resume.textContent = localize('drox.sdtcm.resume', 'Launch a run');
		const launchWarning = localize('drox.sdtcm.launchWarning', 'The selected model is called to build and update the map. This spends tokens.');
		resume.setAttribute('aria-label', `${launchWarning}: ${resume.textContent}`);
		this._ui.add(this.hoverService.setupDelayedHover(resume, () => ({
			content: droxTokenWarningHoverContent(launchWarning),
			additionalClasses: [DROX_TOKEN_WARNING_HOVER_CLASS],
			style: HoverStyle.Pointer,
			appearance: { compact: false, showPointer: true },
			position: { hoverPosition: HoverPosition.BELOW },
		})));
		const align = $('button.drox-sdtcm-side-open') as HTMLButtonElement;
		align.textContent = localize('drox.sdtcm.align', 'Realign');
		const paintPhases = () => {
			const running = new Set(expandDroxSdtcmPhases([...pick]));
			for (const phase of DROX_SDTCM_PROBE_PHASES) {
				const chip = chips.get(phase);
				if (!chip) {
					continue;
				}
				const on = running.has(phase);
				chip.classList.toggle('on', on);
				chip.classList.toggle('locked', on && !pick.has(phase));
				chip.setAttribute('aria-pressed', on ? 'true' : 'false');
			}
			const busy = this.sdtcmService.getSnapshot().phase === 'running';
			resume.disabled = running.size === 0 || busy;
			align.disabled = running.size === 0 || busy;
		};
		for (const phase of DROX_SDTCM_PROBE_PHASES) {
			const chip = $('button.drox-sdtcm-phase') as HTMLButtonElement;
			chip.type = 'button';
			chip.textContent = phase;
			chips.set(phase, chip);
			this._ui.add(addDisposableListener(chip, 'click', () => {
				const on = expandDroxSdtcmPhases([...pick]).includes(phase);
				if (on) {
					const rest = new Set(pick);
					rest.delete(phase);
					if (expandDroxSdtcmPhases([...rest]).includes(phase)) {
						return;
					}
					pick.delete(phase);
				} else {
					pick.add(phase);
				}
				this.sdtcmService.setPhasePick([...pick]);
				paintPhases();
			}));
			phaseRow.appendChild(chip);
		}
		this._ui.add(this.sdtcmService.onDidChange(() => paintPhases()));
		paintPhases();
		const zoomOut = $('button.drox-sdtcm-side-open');
		zoomOut.textContent = '−';
		const zoomIn = $('button.drox-sdtcm-side-open');
		zoomIn.textContent = '+';
		const reset = $('button.drox-sdtcm-side-open');
		reset.textContent = localize('drox.sdtcm.reset', 'Reset');
		this._ui.add(addDisposableListener(stop, 'click', () => this.sdtcmService.stop()));
		this._ui.add(addDisposableListener(resume, 'click', () => { void this.sdtcmService.resume(); }));
		this._ui.add(addDisposableListener(align, 'click', () => {
			const folder = this.workspaceService.getWorkspace().folders[0]?.uri;
			if (folder) {
				void this.sdtcmService.align(folder, undefined, expandDroxSdtcmPhases(this.sdtcmService.getPhasePick()));
			}
		}));
		this._ui.add(addDisposableListener(zoomOut, 'click', () => this._setZoom(this._zoom / 1.15)));
		this._ui.add(addDisposableListener(zoomIn, 'click', () => this._setZoom(this._zoom * 1.15)));
		this._ui.add(addDisposableListener(reset, 'click', () => this._resetView()));
		const run = $('div.drox-sdtcm-run');
		run.appendChild(phaseRow);
		const actions = $('div.drox-sdtcm-actions');
		actions.appendChild(stop);
		actions.appendChild(resume);
		actions.appendChild(align);
		actions.appendChild(zoomOut);
		actions.appendChild(zoomIn);
		actions.appendChild(reset);
		toolbar.appendChild(run);
		toolbar.appendChild(actions);
		this._journal = $('div.drox-sdtcm-journal');
		this._viewport = $('div.drox-sdtcm-viewport');
		this._viewport.setAttribute('data-drox-tour', 'sdtcm-graph');
		this._viewport.tabIndex = 0;
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'drox-sdtcm-svg');
		this._world = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		svg.appendChild(this._world);
		this._tooltip = $('div.drox-sdtcm-tooltip');
		this._tooltip.hidden = true;
		this._card = $('div.drox-sdtcm-card');
		this._card.hidden = true;
		this._viewport.appendChild(svg);
		this._viewport.appendChild(this._tooltip);
		this._applyTransform();
		this._bindPointer(this._viewport);
		this._codeHost = $('div.drox-sdtcm-code');
		this._codeHost.hidden = true;
		const codeBar = $('div.drox-sdtcm-code-bar');
		this._codeName = $('span.drox-sdtcm-code-name');
		codeBar.appendChild(this._codeName);
		this._codeEditorHost = $('div.drox-sdtcm-code-editor');
		this._codeHost.appendChild(codeBar);
		this._codeHost.appendChild(this._codeEditorHost);
		const configured = this.configurationService.getValue<ICodeOptions>('editor') ?? {};
		const editorOptions: IEditorConstructionOptions = {
			...configured,
			readOnly: false,
			automaticLayout: false,
			fixedOverflowWidgets: true,
			overflowWidgetsDomNode: this._container,
			scrollbar: { vertical: 'auto', horizontal: 'auto', alwaysConsumeMouseWheel: true },
		};
		this._codeEditor = this._ui.add(this.instantiationService.createInstance(CodeEditorWidget, this._codeEditorHost, editorOptions, {}));
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
		rail.classList.add('collapsed');
		this._rail = rail;
		const exchangeTitle = $('div.drox-sdtcm-rail-title');
		const exchangeLabel = $('span.drox-sdtcm-rail-label');
		exchangeLabel.textContent = localize('drox.sdtcm.exchange', 'Exchange');
		const railToggle = $('button.drox-sdtcm-rail-toggle') as HTMLButtonElement;
		const railGlyph = $('span');
		railGlyph.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronLeft));
		railToggle.appendChild(railGlyph);
		railToggle.ariaLabel = localize('drox.sdtcm.showRail', 'Show');
		railToggle.setAttribute('aria-expanded', 'false');
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
		this._ui.add(this.sdtcmService.onDidReveal(target => {
			void this._openBrick(target.file, target.line);
		}));
		this._ui.add(this.sdtcmService.onDidChangeDisplay(() => {
			if (!this.sdtcmService.getDisplay().move && this._drag) {
				this._folderOffset.set(this._drag.id, { x: this._drag.ox, y: this._drag.oy });
				this._drag = undefined;
			}
			this._paint();
		}));
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
		const folder = this.sdtcmService.takeSessionPin() ?? this.workspaceService.getWorkspace().folders[0]?.uri;
		if (!folder) {
			this._render({
				phase: 'idle',
				mode: 'none',
				message: localize('drox.sdtcm.noFolder', 'Open a folder to build the map.'),
				step: 0,
				maxSteps: 0,
				progress: '',
				journal: [],
				exchanges: [],
				map: { version: 1, entry: null, bricks: [], data: [] },
				files: [],
				tags: [],
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
			if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			viewport.focus();
			this._drag = undefined;
			this._press = undefined;
			this._blankDown = false;
			this._panning = true;
			this._moved = false;
			this._suppressSelect = true;
			this._originX = event.clientX;
			this._originY = event.clientY;
			this._panStartX = this._panX;
			this._panStartY = this._panY;
			viewport.classList.add('panning');
		}, true));
		this._ui.add(addDisposableListener(viewport, 'pointerdown', event => {
			if (event.button !== 0 || event.ctrlKey || event.metaKey) {
				return;
			}
			viewport.focus();
			this._blankDown = true;
			this._moved = false;
			this._originX = event.clientX;
			this._originY = event.clientY;
		}));
		this._ui.add(addDisposableListener(window, 'pointermove', event => {
			if (this._drag) {
				const dx = (event.clientX - this._drag.x) / this._zoom;
				const dy = (event.clientY - this._drag.y) / this._zoom;
				if (Math.abs(dx) + Math.abs(dy) > 3) {
					this._suppressSelect = true;
				}
				this._folderOffset.set(this._drag.id, { x: this._drag.ox + dx, y: this._drag.oy + dy });
				this._paint();
				return;
			}
			if (this._blankDown && !this._panning) {
				const dx = event.clientX - this._originX;
				const dy = event.clientY - this._originY;
				if (Math.abs(dx) + Math.abs(dy) > 3) {
					this._moved = true;
				}
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
			if (this._panning) {
				this._panning = false;
				this._blankDown = false;
				viewport.classList.remove('panning');
				this._suppressSelect = true;
				const suppress = this._suppressSelect;
				setTimeout(() => {
					if (this._suppressSelect === suppress) {
						this._suppressSelect = false;
					}
				}, 0);
				return;
			}
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
				const after = this._folderOffset.get(this._drag.id) ?? { x: 0, y: 0 };
				if (Math.abs(after.x - this._drag.ox) + Math.abs(after.y - this._drag.oy) > 1) {
					this._moves = rememberDroxSdtcmMove(this._moves, {
						id: this._drag.id,
						before: { x: this._drag.ox, y: this._drag.oy },
						after: { x: after.x, y: after.y },
					});
				}
				this._drag = undefined;
				viewport.focus();
				const suppress = this._suppressSelect;
				setTimeout(() => {
					if (this._suppressSelect === suppress) {
						this._suppressSelect = false;
					}
				}, 0);
				return;
			}
			if (!this._blankDown) {
				return;
			}
			const clear = !this._moved;
			this._blankDown = false;
			if (!clear) {
				this._suppressSelect = true;
				const suppress = this._suppressSelect;
				setTimeout(() => {
					if (this._suppressSelect === suppress) {
						this._suppressSelect = false;
					}
				}, 0);
				return;
			}
			this._selected = undefined;
			this._path = undefined;
			this._hideCard();
			this._closeCode();
			this._paint();
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
		this._ui.add(addDisposableListener(viewport, 'keydown', event => {
			if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
				return;
			}
			const key = event.key.toLowerCase();
			if (key !== 'z' && key !== 'y') {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			if (this._drag) {
				return;
			}
			const step = key === 'z' ? undoDroxSdtcmMove(this._moves) : redoDroxSdtcmMove(this._moves);
			if (!step) {
				return;
			}
			const at = key === 'z' ? step.move.before : step.move.after;
			this._moves = step.history;
			this._folderOffset.set(step.move.id, { x: at.x, y: at.y });
			this._paint();
		}));
	}

	private _render(snapshot: IDroxSdtcmSnapshot): void {
		if (!this._status || !this._journal || !this._step || !this._container) {
			return;
		}
		this._snapshot = snapshot;
		this._container.classList.toggle('running', snapshot.phase === 'running');
		this._container.classList.toggle('error', snapshot.phase === 'error');
		this._status.textContent = snapshot.message;
		this._step.textContent = snapshot.progress
			? snapshot.progress
			: snapshot.phase === 'running' && snapshot.maxSteps
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
		const built = buildDroxSdtcmGraph(this._snapshot.map, this._snapshot.files, {
			kinds: display.kinds,
			forms: display.forms,
			links: display.links,
			tags: display.visibleTags,
			tagColors: new Map(this._snapshot.tags.map(tag => [tag.name, tag.color])),
		});
		return shiftDroxSdtcmFolders(placeDroxSdtcmGraph(built), this._folderOffset);
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
			this._path = undefined;
			this._closeCode();
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
		this._viewport.classList.toggle('locked', !display.move);
		this._viewport.querySelector('.drox-sdtcm-hint')?.remove();
		const path = !this._drag && this._path && this._snapshot ? traceDroxSdtcmSelection(this._snapshot.map, this._path.kind, this._path.id) : undefined;
		const dragged = this._drag ? markDroxSdtcmFocus(graph, new Set([this._drag.id])) : undefined;
		const marks = dragged ?? markDroxSdtcmKept(graph, this._snapshot.map, new Set(display.focus), path);
		paintDroxSdtcmGraph(this._world, graph, this._selected, {
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
				if (event.button !== 0 || event.ctrlKey || event.metaKey || (node.kind !== 'file' && node.kind !== 'brick' && node.kind !== 'data')) {
					return;
				}
				this._press = { node, x: event.clientX, y: event.clientY };
			},
			onGrabFolder: (node, event) => {
				if (event.button !== 0 || event.ctrlKey || event.metaKey || !this.sdtcmService.getDisplay().move || !this._nodeInFocus(node.id)) {
					return false;
				}
				const at = this._folderOffset.get(node.id) ?? { x: 0, y: 0 };
				this._drag = { id: node.id, x: event.clientX, y: event.clientY, ox: at.x, oy: at.y };
				this._suppressSelect = false;
				this._paint();
				return true;
			},
			onContextMenu: (node, event) => this._openFocusMenu(node.id, event.clientX, event.clientY),
		}, marks);
		this._applyTransform();
	}

	private _openFocusMenu(id: string, x: number, y: number): void {
		this._hideFolderMenu();
		const menu = $('div.drox-sdtcm-menu');
		menu.style.left = `${x}px`;
		menu.style.top = `${y}px`;
		const item = $('button');
		const kept = this.sdtcmService.getDisplay().focus.includes(id);
		item.textContent = kept
			? localize('drox.sdtcm.removeFromFocus', 'Remove from focus')
			: localize('drox.sdtcm.keepInFocus', 'Keep in focus');
		this._menuUi.add(addDisposableListener(item, 'click', event => {
			event.stopPropagation();
			const current = this.sdtcmService.getDisplay();
			const focus = kept ? current.focus.filter(itemId => itemId !== id) : [...current.focus, id];
			this.sdtcmService.setDisplay({ ...current, focus });
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

	/** A left click or a kept entity, including the folders that stay bright with them. */
	private _nodeInFocus(id: string): boolean {
		if (this._selected === id) {
			return true;
		}
		const graph = this._placedGraph();
		const snapshot = this._snapshot;
		if (!graph || !snapshot) {
			return false;
		}
		const path = this._path ? traceDroxSdtcmSelection(snapshot.map, this._path.kind, this._path.id) : undefined;
		const marks = markDroxSdtcmKept(graph, snapshot.map, new Set(this.sdtcmService.getDisplay().focus), path);
		const mark = marks?.nodes.get(id);
		return mark !== undefined && mark !== 'dim';
	}

	private _select(node: IDroxSdtcmGraphNode): void {
		this._selected = node.id;
		const selectable = node.kind === 'file' || node.kind === 'brick' || node.kind === 'data';
		this._path = selectable && this._path?.id !== node.id ? { kind: node.kind, id: node.id } : undefined;
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
		if (this._codeName) {
			this._codeName.textContent = file;
			this._codeName.title = file;
		}
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
		}, { orientation: Orientation.HORIZONTAL, size: 10 }));
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
			const room = this._stage?.clientHeight ?? 400;
			const max = Math.max(180, room - 36);
			this._codeHeight = clampSize(code0 - (event.currentY - event.startY), 80, max);
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
		if (!this._codeEditor || !this._codeEditorHost || !this._codeOpen) {
			return;
		}
		const width = this._codeEditorHost.clientWidth || this._codeHost?.clientWidth || 0;
		const height = this._codeEditorHost.clientHeight || Math.max(0, (this._codeHost?.clientHeight ?? 0) - 22);
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
		for (const mark of node.marks ?? []) {
			const row = $('div.drox-sdtcm-tooltip-reason');
			row.textContent = mark.reason ? `${mark.name} — ${mark.reason}` : mark.name;
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

	private _resetView(): void {
		this._folderOffset.clear();
		this._moves = emptyDroxSdtcmMoveHistory();
		this._panX = 32;
		this._panY = 32;
		this._zoom = 1;
		this._selected = undefined;
		this._path = undefined;
		this._hideCard();
		this._closeCode();
		this._paint();
	}

	private _closeCode(): void {
		if (!this._codeOpen) {
			return;
		}
		this._openSeq++;
		this._codeOpen = false;
		this._applySplits();
	}

	private _setZoom(zoom: number): void {
		this._zoom = clamp(zoom);
		this._applyTransform();
	}

	private _applyTransform(): void {
		this._world?.setAttribute('transform', `translate(${this._panX} ${this._panY}) scale(${this._zoom})`);
		if (this._viewport) {
			const cell = 32 * this._zoom;
			this._viewport.style.backgroundSize = `${cell}px ${cell}px`;
			this._viewport.style.backgroundPosition = `${this._panX}px ${this._panY}px`;
		}
	}
}

function clamp(zoom: number): number {
	return Math.min(2.6, Math.max(0.05, zoom));
}

function clampSize(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
