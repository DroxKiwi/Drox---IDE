/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import './media/droxGitGraph.css';
import { $, addDisposableListener, clearNode, Dimension, EventType, getWindow } from '../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { toAction } from '../../../../../base/common/actions.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { basename } from '../../../../../base/common/path.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { ILocalGitChangedFile, ILocalGitCommit, ILocalGitCommitDetails, ILocalGitRef, ILocalGitStash, LocalGitResetMode } from '../../../../../platform/git/common/localGitService.js';
import { IDroxGitGraphService, IDroxGitGraphWindow } from '../../common/droxGitGraphService.js';
import { computeDroxGitGraphLayout, DROX_GIT_GRAPH_LANE_WIDTH, DROX_GIT_GRAPH_ROW_HEIGHT, droxGitGraphLaneColor, IDroxGitGraphLayoutRow } from './droxGitGraphLayout.js';
import { DROX_GIT_GRAPH_EDITOR_ID, DroxGitGraphInput } from './droxGitGraphInput.js';
import { createDroxGitRevisionUri, DROX_GIT_EMPTY_REV } from './droxGitRevisionContent.js';

type GraphRowKind = 'uncommitted' | 'stash' | 'commit';

interface IRenderedCommitRow {
	readonly kind: 'commit';
	readonly commit: ILocalGitCommit;
	readonly layout: IDroxGitGraphLayoutRow;
	readonly refs: readonly ILocalGitRef[];
}

export class DroxGitGraphEditor extends EditorPane {

	static readonly ID = DROX_GIT_GRAPH_EDITOR_ID;

	private _container!: HTMLElement;
	private _toolbarEl!: HTMLElement;
	private _bodyEl!: HTMLElement;
	private _listEl!: HTMLElement;
	private _detailEl!: HTMLElement;
	private readonly _contentDisposables = this._register(new DisposableStore());
	private readonly _listDisposables = this._register(new DisposableStore());
	private readonly _detailDisposables = this._register(new DisposableStore());
	private _graphInput: DroxGitGraphInput | undefined;
	private _includeRemotes = true;
	private _searchQuery = '';
	/** `undefined` = show all refs (--all / current). */
	private _selectedBranchRefs: string[] | undefined;
	private _showDate = true;
	private _showAuthor = true;
	private _showHash = true;
	private _selectedHash: string | undefined;
	private _compareHash: string | undefined;
	private _window: IDroxGitGraphWindow | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IDroxGitGraphService private readonly _gitGraphService: IDroxGitGraphService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ICommandService private readonly _commandService: ICommandService,
		@IEditorService private readonly _editorService: IEditorService,
		@IOpenerService private readonly _openerService: IOpenerService,
	) {
		super(DroxGitGraphEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this._container = $('div.drox-git-graph');
		this._toolbarEl = $('div.drox-git-graph-toolbar');
		this._bodyEl = $('div.drox-git-graph-body');
		this._listEl = $('div.drox-git-graph-list');
		this._detailEl = $('div.drox-git-graph-detail');
		this._bodyEl.appendChild(this._listEl);
		this._bodyEl.appendChild(this._detailEl);
		this._container.appendChild(this._toolbarEl);
		this._container.appendChild(this._bodyEl);
		parent.appendChild(this._container);
	}

	override async setInput(input: DroxGitGraphInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this._graphInput = input;
		await this._reload();
	}

	override clearInput(): void {
		this._graphInput = undefined;
		this._window = undefined;
		this._selectedHash = undefined;
		this._compareHash = undefined;
		this._contentDisposables.clear();
		this._listDisposables.clear();
		this._detailDisposables.clear();
		clearNode(this._toolbarEl);
		clearNode(this._listEl);
		clearNode(this._detailEl);
		super.clearInput();
	}

	override layout(dimension: Dimension): void {
		this._container.style.height = `${dimension.height}px`;
		this._container.style.width = `${dimension.width}px`;
	}

	private async _reload(): Promise<void> {
		this._contentDisposables.clear();
		this._listDisposables.clear();
		this._detailDisposables.clear();
		clearNode(this._toolbarEl);
		clearNode(this._listEl);
		clearNode(this._detailEl);

		const input = this._graphInput;
		if (!input) {
			return;
		}

		this._renderToolbarSkeleton();

		const loading = $('div.drox-git-graph-loading');
		loading.textContent = localize('drox.gitGraph.loading', "Loading repository…");
		this._listEl.appendChild(loading);

		let window: IDroxGitGraphWindow | undefined;
		try {
			window = await this._gitGraphService.getGraphWindow(input.folder, {
				includeRemotes: this._includeRemotes,
				refs: this._selectedBranchRefs,
			});
		} catch (err) {
			this._notificationService.error(localize('drox.gitGraph.loadFailed', "Failed to load Git Graph: {0}", String(err)));
			return;
		}

		this._window = window;
		if (!window) {
			clearNode(this._listEl);
			const empty = $('div.drox-git-graph-empty');
			empty.textContent = localize('drox.gitGraph.notRepo', "This folder is not a git repository.");
			this._listEl.appendChild(empty);
			return;
		}

		this._renderToolbar(window);
		clearNode(this._listEl);
		this._renderWindow(window);
		if (this._selectedHash) {
			void this._showCommitDetails(this._selectedHash);
		} else {
			this._renderDetailPlaceholder();
		}
	}

	private _renderToolbarSkeleton(): void {
		const refreshBtn = this._toolbarButton(localize('drox.gitGraph.refresh', "Refresh"), () => void this._reload());
		this._toolbarEl.appendChild(refreshBtn);
	}

	private _renderToolbar(window: IDroxGitGraphWindow): void {
		clearNode(this._toolbarEl);

		this._toolbarEl.appendChild(this._toolbarButton(localize('drox.gitGraph.refresh', "Refresh"), () => void this._reload()));
		this._toolbarEl.appendChild(this._toolbarButton(localize('drox.gitGraph.fetch', "Fetch"), () => void this._runOp(
			() => this._gitGraphService.fetch(this._graphInput!.folder),
			localize('drox.gitGraph.fetched', "Fetch completed"),
		)));

		const remotes = $('label.drox-git-graph-toolbar-check');
		const remotesCb = $('input') as HTMLInputElement;
		remotesCb.type = 'checkbox';
		remotesCb.checked = this._includeRemotes;
		remotes.appendChild(remotesCb);
		const remotesText = $('span');
		remotesText.textContent = localize('drox.gitGraph.showRemotes', "Show Remote Branches");
		remotes.appendChild(remotesText);
		this._contentDisposables.add(addDisposableListener(remotesCb, EventType.CHANGE, () => {
			this._includeRemotes = remotesCb.checked;
			void this._reload();
		}));
		this._toolbarEl.appendChild(remotes);

		this._toolbarEl.appendChild(this._toolbarButton(
			this._selectedBranchRefs?.length
				? localize('drox.gitGraph.branchesFiltered', "Branches ({0})", this._selectedBranchRefs.length)
				: localize('drox.gitGraph.branchesAll', "Branches (All)"),
			() => void this._pickBranches(window),
		));

		const search = $('input.drox-git-graph-search') as HTMLInputElement;
		search.type = 'search';
		search.placeholder = localize('drox.gitGraph.searchPlaceholder', "Search commits…");
		search.value = this._searchQuery;
		this._contentDisposables.add(addDisposableListener(search, EventType.INPUT, () => {
			this._searchQuery = search.value.trim().toLowerCase();
			this._renderWindow(window);
		}));
		this._toolbarEl.appendChild(search);

		const branchLabel = $('span.drox-git-graph-current-branch');
		branchLabel.textContent = window.currentBranch
			? localize('drox.gitGraph.onBranch', "On {0}", window.currentBranch)
			: localize('drox.gitGraph.detached', "Detached HEAD");
		this._toolbarEl.appendChild(branchLabel);
	}

	private _toolbarButton(label: string, onClick: () => void): HTMLElement {
		const btn = $('button.drox-git-graph-refresh');
		btn.textContent = label;
		this._contentDisposables.add(addDisposableListener(btn, EventType.CLICK, onClick));
		return btn;
	}

	private _renderWindow(window: IDroxGitGraphWindow): void {
		this._listDisposables.clear();
		clearNode(this._listEl);

		const header = $('div.drox-git-graph-header');
		header.appendChild($('div.drox-git-graph-header-graph'));
		const headerDesc = $('div.drox-git-graph-header-desc');
		headerDesc.textContent = localize('drox.gitGraph.colDescription', "Description");
		header.appendChild(headerDesc);
		const headerMeta = $('div.drox-git-graph-header-meta');
		if (this._showDate) {
			const d = $('span');
			d.textContent = localize('drox.gitGraph.colDate', "Date");
			headerMeta.appendChild(d);
		}
		if (this._showAuthor) {
			const a = $('span');
			a.textContent = localize('drox.gitGraph.colAuthor', "Author");
			headerMeta.appendChild(a);
		}
		if (this._showHash) {
			const h = $('span');
			h.textContent = localize('drox.gitGraph.colCommit', "Commit");
			headerMeta.appendChild(h);
		}
		header.appendChild(headerMeta);
		this._listDisposables.add(addDisposableListener(header, EventType.CONTEXT_MENU, e => {
			e.preventDefault();
			this._showColumnMenu(e);
		}));
		this._listEl.appendChild(header);

		const refsByHash = new Map<string, ILocalGitRef[]>();
		for (const ref of window.refs) {
			const list = refsByHash.get(ref.hash) ?? [];
			list.push(ref);
			refsByHash.set(ref.hash, list);
		}

		const filteredCommits = window.commits.filter(c => this._matchesSearch(c.hash, c.subject, c.authorName));
		const layoutRows = computeDroxGitGraphLayout(filteredCommits);
		const layoutByHash = new Map(layoutRows.map(r => [r.hash, r]));
		const maxLanes = layoutRows.reduce((m, r) => Math.max(m, r.laneCount), 1);

		if (window.status.uncommittedCount > 0 && this._matchesSearch('', localize('drox.gitGraph.uncommitted', "Uncommitted Changes"), '')) {
			this._listEl.appendChild(this._createSpecialRow({
				kind: 'uncommitted',
				label: localize('drox.gitGraph.uncommitted', "Uncommitted Changes ({0})", window.status.uncommittedCount),
				laneCount: maxLanes,
				openNode: true,
			}));
		}

		for (const stash of window.stashes) {
			if (!this._matchesSearch(stash.hash, stash.subject, stash.reflogSelector)) {
				continue;
			}
			this._listEl.appendChild(this._createSpecialRow({
				kind: 'stash',
				label: `${stash.reflogSelector}: ${stash.subject}`,
				laneCount: maxLanes,
				stash,
			}));
		}

		for (const commit of filteredCommits) {
			const layout = layoutByHash.get(commit.hash);
			if (!layout) {
				continue;
			}
			const row: IRenderedCommitRow = {
				kind: 'commit',
				commit,
				layout,
				refs: refsByHash.get(commit.hash) ?? [],
			};
			this._listEl.appendChild(this._createCommitRow(row, window.currentBranch, maxLanes));
		}
	}

	private _matchesSearch(...parts: string[]): boolean {
		if (!this._searchQuery) {
			return true;
		}
		return parts.some(p => p.toLowerCase().includes(this._searchQuery));
	}

	private _createSpecialRow(opts: {
		readonly kind: Exclude<GraphRowKind, 'commit'>;
		readonly label: string;
		readonly laneCount: number;
		readonly openNode?: boolean;
		readonly stash?: ILocalGitStash;
	}): HTMLElement {
		const row = $('div.drox-git-graph-row');
		row.classList.add(`kind-${opts.kind}`);
		row.appendChild(this._createGraphColumn(opts.laneCount, undefined, opts.openNode));

		const desc = $('div.drox-git-graph-desc');
		const subject = $('div.drox-git-graph-subject');
		subject.textContent = opts.label;
		desc.appendChild(subject);
		row.appendChild(desc);
		row.appendChild($('div.drox-git-graph-meta'));

		if (opts.kind === 'uncommitted') {
			this._listDisposables.add(addDisposableListener(row, EventType.CONTEXT_MENU, e => {
				e.preventDefault();
				this._showUncommittedMenu(e);
			}));
		} else if (opts.stash) {
			const stash = opts.stash;
			this._listDisposables.add(addDisposableListener(row, EventType.CONTEXT_MENU, e => {
				e.preventDefault();
				this._showStashMenu(e, stash);
			}));
		}
		return row;
	}

	private _createCommitRow(rowData: IRenderedCommitRow, currentBranch: string | undefined, maxLanes: number): HTMLElement {
		const { commit, layout, refs } = rowData;
		const row = $('div.drox-git-graph-row');
		if (this._selectedHash === commit.hash || this._compareHash === commit.hash) {
			row.classList.add('selected');
		}
		row.appendChild(this._createGraphColumn(maxLanes, layout));

		const desc = $('div.drox-git-graph-desc');
		const pills = $('div.drox-git-graph-pills');
		for (const ref of refs) {
			pills.appendChild(this._createPill(ref, currentBranch, layout.colorIndex));
		}
		if (refs.length) {
			desc.appendChild(pills);
		}
		const subject = $('div.drox-git-graph-subject');
		subject.textContent = commit.subject;
		desc.appendChild(subject);
		row.appendChild(desc);

		const meta = $('div.drox-git-graph-meta');
		if (this._showDate) {
			const date = $('span.drox-git-graph-date');
			date.textContent = new Date(commit.authorDateSeconds * 1000).toLocaleString();
			meta.appendChild(date);
		}
		if (this._showAuthor) {
			const author = $('span.drox-git-graph-author');
			author.textContent = commit.authorName;
			meta.appendChild(author);
		}
		if (this._showHash) {
			const hash = $('span.drox-git-graph-hash');
			hash.textContent = commit.hash.slice(0, 8);
			meta.appendChild(hash);
		}
		row.appendChild(meta);

		this._listDisposables.add(addDisposableListener(row, EventType.CLICK, e => {
			if ((e.target as HTMLElement).closest('.drox-git-graph-pill')) {
				return;
			}
			if (e.ctrlKey || e.metaKey) {
				if (!this._selectedHash || this._selectedHash === commit.hash) {
					this._selectedHash = commit.hash;
					this._compareHash = undefined;
				} else {
					this._compareHash = commit.hash;
					this._notificationService.info(localize(
						'drox.gitGraph.compareHint',
						"Compare {0}…{1}",
						this._selectedHash.slice(0, 8),
						commit.hash.slice(0, 8),
					));
				}
			} else {
				this._selectedHash = commit.hash;
				this._compareHash = undefined;
			}
			void this._showCommitDetails(commit.hash);
			if (this._window) {
				this._renderWindow(this._window);
			}
		}));

		this._listDisposables.add(addDisposableListener(row, EventType.CONTEXT_MENU, e => {
			e.preventDefault();
			this._showCommitMenu(e, commit);
		}));

		return row;
	}

	private _createPill(ref: ILocalGitRef, currentBranch: string | undefined, colorIndex: number): HTMLElement {
		const pill = $('span.drox-git-graph-pill');
		pill.classList.add(`kind-${ref.kind}`);
		if (ref.kind === 'head' && ref.name === currentBranch) {
			pill.classList.add('current');
		}
		const color = droxGitGraphLaneColor(colorIndex);
		pill.style.background = `color-mix(in srgb, ${color} 45%, transparent)`;
		pill.style.outlineColor = color;
		pill.textContent = ref.name;
		pill.title = localize('drox.gitGraph.pillHint', "Double-click to checkout {0}", ref.name);

		if (ref.kind === 'head' || ref.kind === 'remote') {
			this._listDisposables.add(addDisposableListener(pill, EventType.DBLCLICK, e => {
				e.preventDefault();
				e.stopPropagation();
				void this._checkoutRef(ref);
			}));
		}

		this._listDisposables.add(addDisposableListener(pill, EventType.CONTEXT_MENU, e => {
			e.preventDefault();
			e.stopPropagation();
			if (ref.kind === 'head') {
				this._showLocalBranchMenu(e, ref);
			} else if (ref.kind === 'remote') {
				this._showRemoteBranchMenu(e, ref);
			} else {
				this._showTagMenu(e, ref);
			}
		}));

		return pill;
	}

	private _createGraphColumn(laneCount: number, layout: IDroxGitGraphLayoutRow | undefined, openNode?: boolean): HTMLElement {
		const width = Math.max(laneCount, 1) * DROX_GIT_GRAPH_LANE_WIDTH + 10;
		const col = $('div.drox-git-graph-lanes');
		col.style.width = `${width}px`;

		if (!layout) {
			const node = $('div.drox-git-graph-node');
			node.classList.toggle('open', !!openNode);
			node.style.left = `${DROX_GIT_GRAPH_LANE_WIDTH / 2}px`;
			col.appendChild(node);
			return col;
		}

		const doc = getWindow(this._container).document;
		const svgNS = 'http://www.w3.org/2000/svg';
		const svg = doc.createElementNS(svgNS, 'svg');
		svg.setAttribute('class', 'drox-git-graph-svg');
		svg.setAttribute('width', String(width));
		svg.setAttribute('height', String(DROX_GIT_GRAPH_ROW_HEIGHT));
		svg.setAttribute('viewBox', `0 0 ${width} ${DROX_GIT_GRAPH_ROW_HEIGHT}`);
		svg.setAttribute('preserveAspectRatio', 'none');

		const midY = DROX_GIT_GRAPH_ROW_HEIGHT / 2;
		const xAt = (lane: number) => lane * DROX_GIT_GRAPH_LANE_WIDTH + DROX_GIT_GRAPH_LANE_WIDTH / 2;
		const yAt = (anchor: 'top' | 'node' | 'bottom') =>
			anchor === 'top' ? 0 : anchor === 'bottom' ? DROX_GIT_GRAPH_ROW_HEIGHT : midY;

		for (const edge of layout.edges) {
			const path = doc.createElementNS(svgNS, 'path');
			const x1 = xAt(edge.fromLane);
			const x2 = xAt(edge.toLane);
			const y1 = yAt(edge.from);
			const y2 = yAt(edge.to);
			let d: string;
			if (edge.fromLane === edge.toLane) {
				d = `M ${x1} ${y1} V ${y2}`;
			} else {
				const cy1 = y1 + (y2 - y1) * 0.35;
				const cy2 = y1 + (y2 - y1) * 0.65;
				d = `M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`;
			}
			path.setAttribute('d', d);
			path.setAttribute('stroke', droxGitGraphLaneColor(edge.colorIndex));
			path.setAttribute('fill', 'none');
			path.setAttribute('stroke-width', '2');
			path.setAttribute('stroke-linecap', 'round');
			svg.appendChild(path);
		}

		const circle = doc.createElementNS(svgNS, 'circle');
		circle.setAttribute('cx', String(xAt(layout.lane)));
		circle.setAttribute('cy', String(midY));
		circle.setAttribute('r', '4.5');
		circle.setAttribute('fill', droxGitGraphLaneColor(layout.colorIndex));
		svg.appendChild(circle);
		col.appendChild(svg);
		return col;
	}

	private _renderDetailPlaceholder(): void {
		this._detailDisposables.clear();
		clearNode(this._detailEl);
		const placeholder = $('div.drox-git-graph-detail-empty');
		placeholder.textContent = localize('drox.gitGraph.detailHint', "Select a commit to inspect details.");
		this._detailEl.appendChild(placeholder);
	}

	private async _showCommitDetails(hash: string): Promise<void> {
		const input = this._graphInput;
		if (!input) {
			return;
		}
		this._detailDisposables.clear();
		clearNode(this._detailEl);
		const loading = $('div.drox-git-graph-detail-empty');
		loading.textContent = localize('drox.gitGraph.detailLoading', "Loading commit…");
		this._detailEl.appendChild(loading);

		const comparing = !!(this._selectedHash && this._compareHash && this._selectedHash !== this._compareHash);
		const baseRev = comparing ? this._selectedHash! : undefined;
		const headRev = comparing ? this._compareHash! : hash;

		let details: ILocalGitCommitDetails | undefined;
		let files: readonly ILocalGitChangedFile[] = [];
		try {
			details = await this._gitGraphService.getCommitDetails(input.folder, hash);
			if (comparing && baseRev && headRev) {
				files = await this._gitGraphService.getChangedFilesBetween(input.folder, baseRev, headRev);
			} else {
				files = details?.files ?? [];
			}
		} catch (err) {
			this._notificationService.error(String(err));
			return;
		}
		if (!details) {
			clearNode(this._detailEl);
			const empty = $('div.drox-git-graph-detail-empty');
			empty.textContent = localize('drox.gitGraph.detailMissing', "Commit details unavailable.");
			this._detailEl.appendChild(empty);
			return;
		}

		this._detailDisposables.clear();
		clearNode(this._detailEl);
		const title = $('div.drox-git-graph-detail-title');
		title.textContent = details.subject;
		this._detailEl.appendChild(title);

		const meta = $('div.drox-git-graph-detail-meta');
		meta.textContent = `${details.authorName} <${details.authorEmail}> · ${new Date(details.authorDateSeconds * 1000).toLocaleString()} · `;
		const hashEl = $('span.drox-git-graph-detail-hash');
		hashEl.textContent = details.hash.slice(0, 12);
		meta.appendChild(hashEl);
		this._detailEl.appendChild(meta);

		if (details.parents.length) {
			const parents = $('div.drox-git-graph-detail-parents');
			const doc = getWindow(this._container).document;
			parents.appendChild(doc.createTextNode(localize('drox.gitGraph.parents', "Parents: ")));
			for (const parent of details.parents) {
				const link = $('button.drox-git-graph-parent-link');
				link.textContent = parent.slice(0, 8);
				this._detailDisposables.add(addDisposableListener(link, EventType.CLICK, () => {
					this._selectedHash = parent;
					this._compareHash = undefined;
					void this._showCommitDetails(parent);
					if (this._window) {
						this._renderWindow(this._window);
					}
				}));
				parents.appendChild(link);
			}
			this._detailEl.appendChild(parents);
		}

		if (details.body.trim()) {
			this._detailEl.appendChild(this._renderLinkedBody(details.body.trim()));
		}

		if (comparing && baseRev && headRev) {
			const compare = $('div.drox-git-graph-detail-compare');
			compare.textContent = localize(
				'drox.gitGraph.compareSelected',
				"Comparing {0} → {1}",
				baseRev.slice(0, 8),
				headRev.slice(0, 8),
			);
			this._detailEl.appendChild(compare);
		}

		const filesTitle = $('div.drox-git-graph-detail-files-title');
		filesTitle.textContent = localize('drox.gitGraph.changedFiles', "Changed files ({0})", files.length);
		this._detailEl.appendChild(filesTitle);

		const filesEl = $('div.drox-git-graph-detail-files');
		for (const file of files) {
			const item = $('button.drox-git-graph-detail-file');
			item.textContent = `${file.status}  ${file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}`;
			this._detailDisposables.add(addDisposableListener(item, EventType.CLICK, () => {
				void this._openFileDiff(file, {
					baseRev: comparing && baseRev ? baseRev : (details!.parents[0] ?? DROX_GIT_EMPTY_REV),
					headRev: comparing && headRev ? headRev : details!.hash,
					againstWorkingTree: false,
				});
			}));
			this._detailDisposables.add(addDisposableListener(item, EventType.CONTEXT_MENU, e => {
				e.preventDefault();
				this._showFileMenu(e, file, {
					commitHash: details!.hash,
					parentHash: details!.parents[0],
					compareBase: comparing ? baseRev : undefined,
					compareHead: comparing ? headRev : undefined,
				});
			}));
			filesEl.appendChild(item);
		}
		this._detailEl.appendChild(filesEl);
	}

	private _renderLinkedBody(body: string): HTMLElement {
		const pre = $('pre.drox-git-graph-detail-body');
		const doc = getWindow(this._container).document;
		const urlRe = /https?:\/\/[^\s<>\]]+/g;
		let last = 0;
		let match: RegExpExecArray | null;
		while ((match = urlRe.exec(body)) !== null) {
			if (match.index > last) {
				pre.appendChild(doc.createTextNode(body.slice(last, match.index)));
			}
			const url = match[0];
			const a = $('a.drox-git-graph-body-link') as HTMLAnchorElement;
			a.textContent = url;
			a.href = url;
			this._detailDisposables.add(addDisposableListener(a, EventType.CLICK, e => {
				e.preventDefault();
				void this._openerService.open(URI.parse(url), { openExternal: true });
			}));
			pre.appendChild(a);
			last = match.index + url.length;
		}
		if (last < body.length) {
			pre.appendChild(doc.createTextNode(body.slice(last)));
		}
		return pre;
	}

	private async _openRepoFile(relativePath: string): Promise<void> {
		const root = this._window?.repoRoot;
		if (!root) {
			return;
		}
		await this._editorService.openEditor({ resource: joinPath(root, relativePath), options: { pinned: false } });
	}

	private async _openFileAtRevision(rev: string, relativePath: string): Promise<void> {
		const root = this._window?.repoRoot;
		if (!root) {
			return;
		}
		const resource = createDroxGitRevisionUri(root, rev, relativePath);
		await this._editorService.openEditor({
			resource,
			options: { pinned: true },
		});
	}

	private async _openFileDiff(
		file: ILocalGitChangedFile,
		opts: { readonly baseRev: string; readonly headRev: string; readonly againstWorkingTree: boolean },
	): Promise<void> {
		const root = this._window?.repoRoot;
		if (!root) {
			return;
		}
		const status = file.status[0] ?? 'M';
		const oldPath = file.oldPath ?? file.path;
		const newPath = file.path;

		let original: URI;
		let modified: URI;
		if (opts.againstWorkingTree) {
			original = status === 'A'
				? createDroxGitRevisionUri(root, DROX_GIT_EMPTY_REV, newPath)
				: createDroxGitRevisionUri(root, opts.headRev, oldPath);
			modified = joinPath(root, newPath);
		} else {
			original = status === 'A'
				? createDroxGitRevisionUri(root, DROX_GIT_EMPTY_REV, newPath)
				: createDroxGitRevisionUri(root, opts.baseRev === DROX_GIT_EMPTY_REV ? DROX_GIT_EMPTY_REV : opts.baseRev, oldPath);
			modified = status === 'D'
				? createDroxGitRevisionUri(root, DROX_GIT_EMPTY_REV, oldPath)
				: createDroxGitRevisionUri(root, opts.headRev, newPath);
		}

		await this._editorService.openEditor({
			original: { resource: original },
			modified: { resource: modified },
			label: localize('drox.gitGraph.diffLabel', "{0} ({1} ↔ {2})", basename(newPath), opts.baseRev.slice(0, 8), opts.againstWorkingTree ? 'WT' : opts.headRev.slice(0, 8)),
			options: { pinned: true },
		});
	}

	private _showCommitMenu(e: MouseEvent, commit: ILocalGitCommit): void {
		const input = this._graphInput;
		if (!input) {
			return;
		}
		const anchor = new StandardMouseEvent(getWindow(this._container), e);
		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [
				toAction({ id: 'drox.gitGraph.addTag', label: localize('drox.gitGraph.addTag', "Add Tag…"), run: () => this._promptAddTag(commit.hash) }),
				toAction({ id: 'drox.gitGraph.createBranch', label: localize('drox.gitGraph.createBranch', "Create Branch…"), run: () => this._promptCreateBranch(commit.hash) }),
				toAction({ id: 'drox.gitGraph.checkoutCommit', label: localize('drox.gitGraph.checkoutCommit', "Checkout…"), run: () => this._checkoutSafe(commit.hash.slice(0, 8), () => this._gitGraphService.checkoutDetached(input.folder, commit.hash)) }),
				toAction({ id: 'drox.gitGraph.cherryPick', label: localize('drox.gitGraph.cherryPick', "Cherry Pick…"), run: () => this._confirmOp(localize('drox.gitGraph.cherryPickConfirm', "Cherry-pick {0}?", commit.hash.slice(0, 8)), () => this._gitGraphService.cherryPick(input.folder, commit.hash)) }),
				toAction({ id: 'drox.gitGraph.revert', label: localize('drox.gitGraph.revert', "Revert…"), run: () => this._confirmOp(localize('drox.gitGraph.revertConfirm', "Revert {0}?", commit.hash.slice(0, 8)), () => this._gitGraphService.revertCommit(input.folder, commit.hash)) }),
				toAction({ id: 'drox.gitGraph.merge', label: localize('drox.gitGraph.merge', "Merge into current branch…"), run: () => this._confirmOp(localize('drox.gitGraph.mergeConfirm', "Merge {0} into the current branch?", commit.hash.slice(0, 8)), () => this._gitGraphService.merge(input.folder, commit.hash)) }),
				toAction({ id: 'drox.gitGraph.rebase', label: localize('drox.gitGraph.rebase', "Rebase current branch on this Commit…"), run: () => this._confirmOp(localize('drox.gitGraph.rebaseConfirm', "Rebase onto {0}?", commit.hash.slice(0, 8)), () => this._gitGraphService.rebase(input.folder, commit.hash)) }),
				toAction({ id: 'drox.gitGraph.resetSoft', label: localize('drox.gitGraph.resetSoft', "Reset current branch to this Commit (Soft)…"), run: () => this._confirmReset(commit.hash, 'soft') }),
				toAction({ id: 'drox.gitGraph.resetMixed', label: localize('drox.gitGraph.resetMixed', "Reset current branch to this Commit (Mixed)…"), run: () => this._confirmReset(commit.hash, 'mixed') }),
				toAction({ id: 'drox.gitGraph.resetHard', label: localize('drox.gitGraph.resetHard', "Reset current branch to this Commit (Hard)…"), run: () => this._confirmReset(commit.hash, 'hard') }),
				toAction({ id: 'drox.gitGraph.copyHash', label: localize('drox.gitGraph.copyHash', "Copy Commit Hash to Clipboard"), run: () => this._clipboardService.writeText(commit.hash) }),
				toAction({ id: 'drox.gitGraph.copySubject', label: localize('drox.gitGraph.copySubject', "Copy Commit Subject to Clipboard"), run: () => this._clipboardService.writeText(commit.subject) }),
			],
		});
	}

	private _showLocalBranchMenu(e: MouseEvent, ref: ILocalGitRef): void {
		const input = this._graphInput;
		const current = this._window?.currentBranch;
		if (!input) {
			return;
		}
		const isCurrent = ref.name === current;
		const anchor = new StandardMouseEvent(getWindow(this._container), e);
		const actions = [
			...(isCurrent ? [] : [
				toAction({ id: 'drox.gitGraph.checkoutBranch', label: localize('drox.gitGraph.checkoutBranch', "Checkout Branch"), run: () => this._checkoutRef(ref) }),
				toAction({ id: 'drox.gitGraph.deleteBranch', label: localize('drox.gitGraph.deleteBranch', "Delete Branch…"), run: () => this._confirmOp(localize('drox.gitGraph.deleteBranchConfirm', "Delete branch {0}?", ref.name), () => this._gitGraphService.deleteBranch(input.folder, ref.name)) }),
				toAction({ id: 'drox.gitGraph.mergeBranch', label: localize('drox.gitGraph.mergeBranch', "Merge into current branch…"), run: () => this._confirmOp(localize('drox.gitGraph.mergeBranchConfirm', "Merge {0}?", ref.name), () => this._gitGraphService.merge(input.folder, ref.name)) }),
				toAction({ id: 'drox.gitGraph.rebaseBranch', label: localize('drox.gitGraph.rebaseBranch', "Rebase current branch on Branch…"), run: () => this._confirmOp(localize('drox.gitGraph.rebaseBranchConfirm', "Rebase onto {0}?", ref.name), () => this._gitGraphService.rebase(input.folder, ref.name)) }),
			]),
			toAction({ id: 'drox.gitGraph.renameBranch', label: localize('drox.gitGraph.renameBranch', "Rename Branch…"), run: () => this._promptRenameBranch(ref.name) }),
			toAction({ id: 'drox.gitGraph.pushBranch', label: localize('drox.gitGraph.pushBranch', "Push Branch…"), run: () => this._runOp(() => this._gitGraphService.pushBranch(input.folder, ref.name, { setUpstream: true }), localize('drox.gitGraph.pushed', "Pushed {0}", ref.name)) }),
			toAction({ id: 'drox.gitGraph.copyBranch', label: localize('drox.gitGraph.copyBranch', "Copy Branch Name to Clipboard"), run: () => this._clipboardService.writeText(ref.name) }),
		];
		this._contextMenuService.showContextMenu({ getAnchor: () => anchor, getActions: () => actions });
	}

	private _showRemoteBranchMenu(e: MouseEvent, ref: ILocalGitRef): void {
		const input = this._graphInput;
		if (!input) {
			return;
		}
		const anchor = new StandardMouseEvent(getWindow(this._container), e);
		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [
				toAction({ id: 'drox.gitGraph.checkoutRemote', label: localize('drox.gitGraph.checkoutRemote', "Checkout Branch…"), run: () => this._checkoutRef(ref) }),
				toAction({ id: 'drox.gitGraph.deleteRemote', label: localize('drox.gitGraph.deleteRemote', "Delete Remote Branch…"), run: () => this._confirmOp(localize('drox.gitGraph.deleteRemoteConfirm', "Delete remote branch {0}?", ref.name), () => this._gitGraphService.deleteRemoteBranch(input.folder, ref.name)) }),
				toAction({ id: 'drox.gitGraph.mergeRemote', label: localize('drox.gitGraph.pullMergeRemote', "Merge into current branch…"), run: () => this._confirmOp(localize('drox.gitGraph.mergeRemoteConfirm', "Merge {0}?", ref.name), () => this._gitGraphService.merge(input.folder, ref.name)) }),
				toAction({ id: 'drox.gitGraph.copyRemote', label: localize('drox.gitGraph.copyBranch', "Copy Branch Name to Clipboard"), run: () => this._clipboardService.writeText(ref.name) }),
			],
		});
	}

	private _showTagMenu(e: MouseEvent, ref: ILocalGitRef): void {
		const input = this._graphInput;
		if (!input) {
			return;
		}
		const anchor = new StandardMouseEvent(getWindow(this._container), e);
		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [
				toAction({ id: 'drox.gitGraph.deleteTag', label: localize('drox.gitGraph.deleteTag', "Delete Tag…"), run: () => this._confirmOp(localize('drox.gitGraph.deleteTagConfirm', "Delete tag {0}?", ref.name), () => this._gitGraphService.deleteTag(input.folder, ref.name)) }),
				toAction({ id: 'drox.gitGraph.pushTag', label: localize('drox.gitGraph.pushTag', "Push Tag…"), run: () => this._runOp(() => this._gitGraphService.pushTag(input.folder, ref.name), localize('drox.gitGraph.pushedTag', "Pushed tag {0}", ref.name)) }),
				toAction({ id: 'drox.gitGraph.copyTag', label: localize('drox.gitGraph.copyTag', "Copy Tag Name to Clipboard"), run: () => this._clipboardService.writeText(ref.name) }),
			],
		});
	}

	private _showStashMenu(e: MouseEvent, stash: ILocalGitStash): void {
		const input = this._graphInput;
		if (!input) {
			return;
		}
		const anchor = new StandardMouseEvent(getWindow(this._container), e);
		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [
				toAction({ id: 'drox.gitGraph.stashApply', label: localize('drox.gitGraph.stashApply', "Apply Stash…"), run: () => this._runOp(() => this._gitGraphService.stashApply(input.folder, stash.reflogSelector), localize('drox.gitGraph.stashApplied', "Applied {0}", stash.reflogSelector)) }),
				toAction({ id: 'drox.gitGraph.stashPop', label: localize('drox.gitGraph.stashPop', "Pop Stash…"), run: () => this._runOp(() => this._gitGraphService.stashPop(input.folder, stash.reflogSelector), localize('drox.gitGraph.stashPopped', "Popped {0}", stash.reflogSelector)) }),
				toAction({ id: 'drox.gitGraph.stashDrop', label: localize('drox.gitGraph.stashDrop', "Drop Stash…"), run: () => this._confirmOp(localize('drox.gitGraph.stashDropConfirm', "Drop {0}?", stash.reflogSelector), () => this._gitGraphService.stashDrop(input.folder, stash.reflogSelector)) }),
				toAction({ id: 'drox.gitGraph.stashBranch', label: localize('drox.gitGraph.stashBranch', "Create Branch from Stash…"), run: () => this._promptCreateBranch(stash.hash) }),
				toAction({ id: 'drox.gitGraph.copyStash', label: localize('drox.gitGraph.copyStash', "Copy Stash Name / Hash"), run: () => this._clipboardService.writeText(`${stash.reflogSelector} ${stash.hash}`) }),
			],
		});
	}

	private _showUncommittedMenu(e: MouseEvent): void {
		const input = this._graphInput;
		if (!input) {
			return;
		}
		const anchor = new StandardMouseEvent(getWindow(this._container), e);
		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [
				toAction({ id: 'drox.gitGraph.stashPush', label: localize('drox.gitGraph.stashPush', "Stash uncommitted changes…"), run: () => this._promptStash() }),
				toAction({ id: 'drox.gitGraph.resetUncommitted', label: localize('drox.gitGraph.resetUncommitted', "Reset uncommitted changes…"), run: () => this._confirmOp(localize('drox.gitGraph.resetUncommittedConfirm', "Discard all uncommitted changes?"), () => this._gitGraphService.resetUncommitted(input.folder, 'hard')) }),
				toAction({ id: 'drox.gitGraph.cleanUntracked', label: localize('drox.gitGraph.cleanUntracked', "Clean untracked files…"), run: () => this._confirmOp(localize('drox.gitGraph.cleanConfirm', "Remove untracked files?"), () => this._gitGraphService.cleanUntracked(input.folder)) }),
				toAction({ id: 'drox.gitGraph.openScm', label: localize('drox.gitGraph.openScm', "Open Source Control View"), run: () => this._commandService.executeCommand('workbench.view.scm') }),
			],
		});
	}

	private _showFileMenu(
		e: MouseEvent,
		file: ILocalGitChangedFile,
		ctx: {
			readonly commitHash: string;
			readonly parentHash: string | undefined;
			readonly compareBase?: string;
			readonly compareHead?: string;
		},
	): void {
		const root = this._window?.repoRoot;
		const relativePath = file.path;
		const anchor = new StandardMouseEvent(getWindow(this._container), e);
		const baseRev = ctx.compareBase ?? ctx.parentHash ?? DROX_GIT_EMPTY_REV;
		const headRev = ctx.compareHead ?? ctx.commitHash;
		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [
				toAction({
					id: 'drox.gitGraph.viewDiff',
					label: localize('drox.gitGraph.viewDiff', "View Diff"),
					run: () => this._openFileDiff(file, { baseRev, headRev, againstWorkingTree: false }),
				}),
				toAction({
					id: 'drox.gitGraph.viewAtRev',
					label: localize('drox.gitGraph.viewAtRev', "View File at this Revision"),
					run: () => this._openFileAtRevision(ctx.commitHash, relativePath),
				}),
				toAction({
					id: 'drox.gitGraph.viewDiffWorking',
					label: localize('drox.gitGraph.viewDiffWorking', "View Diff with Working File"),
					run: () => this._openFileDiff(file, { baseRev: ctx.commitHash, headRev: ctx.commitHash, againstWorkingTree: true }),
				}),
				toAction({ id: 'drox.gitGraph.openFile', label: localize('drox.gitGraph.openFile', "Open File"), run: () => this._openRepoFile(relativePath) }),
				toAction({
					id: 'drox.gitGraph.copyRel',
					label: localize('drox.gitGraph.copyRel', "Copy Relative File Path"),
					run: () => this._clipboardService.writeText(relativePath),
				}),
				toAction({
					id: 'drox.gitGraph.copyAbs',
					label: localize('drox.gitGraph.copyAbs', "Copy Absolute File Path"),
					run: async () => {
						if (root) {
							await this._clipboardService.writeText(joinPath(root, relativePath).fsPath);
						}
					},
				}),
			],
		});
	}

	private _showColumnMenu(e: MouseEvent): void {
		const anchor = new StandardMouseEvent(getWindow(this._container), e);
		this._contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => [
				toAction({
					id: 'drox.gitGraph.toggleDate',
					label: localize('drox.gitGraph.toggleDate', "Date"),
					checked: this._showDate,
					run: () => {
						this._showDate = !this._showDate;
						if (this._window) {
							this._renderWindow(this._window);
						}
					},
				}),
				toAction({
					id: 'drox.gitGraph.toggleAuthor',
					label: localize('drox.gitGraph.toggleAuthor', "Author"),
					checked: this._showAuthor,
					run: () => {
						this._showAuthor = !this._showAuthor;
						if (this._window) {
							this._renderWindow(this._window);
						}
					},
				}),
				toAction({
					id: 'drox.gitGraph.toggleHash',
					label: localize('drox.gitGraph.toggleCommit', "Commit"),
					checked: this._showHash,
					run: () => {
						this._showHash = !this._showHash;
						if (this._window) {
							this._renderWindow(this._window);
						}
					},
				}),
			],
		});
	}

	private async _pickBranches(window: IDroxGitGraphWindow): Promise<void> {
		const branchRefs = window.refs.filter(r => r.kind === 'head' || r.kind === 'remote');
		const selected = new Set(this._selectedBranchRefs ?? []);
		const items: (IQuickPickItem & { refName?: string })[] = [
			{
				id: 'all',
				label: localize('drox.gitGraph.showAllBranches', "Show All Branches"),
				description: localize('drox.gitGraph.showAllBranchesDesc', "Clear branch filter"),
			},
			...branchRefs.map(ref => ({
				id: `ref:${ref.name}`,
				label: ref.name,
				description: ref.kind,
				refName: ref.name,
				picked: selected.has(ref.name),
			})),
		];
		const picks = await this._quickInputService.pick(items, {
			canPickMany: true,
			placeHolder: localize('drox.gitGraph.pickBranches', "Select branches to show"),
		});
		if (!picks) {
			return;
		}
		if (picks.some(p => p.id === 'all') || picks.every(p => !p.refName)) {
			this._selectedBranchRefs = undefined;
		} else {
			this._selectedBranchRefs = picks.map(p => p.refName).filter((n): n is string => !!n);
		}
		await this._reload();
	}

	private async _checkoutRef(ref: ILocalGitRef): Promise<void> {
		const input = this._graphInput;
		if (!input) {
			return;
		}
		let branch = ref.name;
		if (ref.kind === 'remote') {
			const slash = ref.name.indexOf('/');
			branch = slash >= 0 ? ref.name.slice(slash + 1) : ref.name;
		}
		await this._checkoutSafe(
			branch,
			() => this._gitGraphService.checkoutBranch(input.folder, branch),
		);
	}

	/**
	 * Checkout with a friendly prompt when the working tree would block the switch
	 * (stash & checkout, discard & checkout, or cancel).
	 */
	private async _checkoutSafe(targetLabel: string, doCheckout: () => Promise<void>): Promise<void> {
		const input = this._graphInput;
		if (!input) {
			return;
		}

		const attempt = async (): Promise<boolean> => {
			try {
				await doCheckout();
				this._notificationService.info(localize('drox.gitGraph.checkedOut', "Checked out {0}", targetLabel));
				await this._reload();
				return true;
			} catch (err) {
				if (!this._isDirtyWorkingTreeCheckoutError(err)) {
					this._notificationService.error(localize('drox.gitGraph.opFailed', "Git operation failed: {0}", String(err)));
					return true; // handled
				}
				return false; // needs dirty-tree prompt
			}
		};

		if (await attempt()) {
			return;
		}

		const { result } = await this._dialogService.prompt<{ kind: 'stash' | 'discard' }>({
			type: Severity.Warning,
			message: localize(
				'drox.gitGraph.checkoutBlocked',
				"Cannot checkout \"{0}\" because you have uncommitted changes that would be overwritten.",
				targetLabel,
			),
			detail: localize(
				'drox.gitGraph.checkoutBlockedDetail',
				"Stash your changes to keep them, or discard them to switch immediately.",
			),
			buttons: [
				{
					label: localize('drox.gitGraph.stashAndCheckout', "Stash & Checkout"),
					run: () => ({ kind: 'stash' as const }),
				},
				{
					label: localize('drox.gitGraph.discardAndCheckout', "Discard & Checkout"),
					run: () => ({ kind: 'discard' as const }),
				},
			],
			cancelButton: {
				label: localize('drox.gitGraph.checkoutCancel', "Cancel"),
				run: () => undefined,
			},
		});

		if (!result) {
			return;
		}

		try {
			if (result.kind === 'stash') {
				await this._gitGraphService.stashPush(input.folder, {
					message: localize('drox.gitGraph.stashBeforeCheckout', "Drox: stash before checkout {0}", targetLabel),
					includeUntracked: true,
				});
			} else {
				await this._gitGraphService.resetUncommitted(input.folder, 'hard');
				await this._gitGraphService.cleanUntracked(input.folder);
			}
			await doCheckout();
			this._notificationService.info(localize('drox.gitGraph.checkedOut', "Checked out {0}", targetLabel));
			await this._reload();
		} catch (err) {
			this._notificationService.error(localize('drox.gitGraph.opFailed', "Git operation failed: {0}", String(err)));
		}
	}

	private _isDirtyWorkingTreeCheckoutError(err: unknown): boolean {
		const text = String(err);
		return /would be overwritten by checkout|Please commit your changes or stash them|local changes.*overwritten/i.test(text);
	}

	private async _promptCreateBranch(startPoint: string): Promise<void> {
		const input = this._graphInput;
		if (!input) {
			return;
		}
		const name = await this._quickInputService.input({
			prompt: localize('drox.gitGraph.branchNamePrompt', "Branch name"),
			placeHolder: localize('drox.gitGraph.branchNamePlaceholder', "feature/my-branch"),
		});
		if (!name?.trim()) {
			return;
		}
		const checkout = await this._dialogService.confirm({
			message: localize('drox.gitGraph.checkoutNewBranch', "Checkout the new branch after creating it?"),
		});
		await this._runOp(
			() => this._gitGraphService.createBranch(input.folder, name.trim(), { startPoint, checkout: checkout.confirmed }),
			localize('drox.gitGraph.branchCreated', "Created branch {0}", name.trim()),
		);
	}

	private async _promptRenameBranch(oldName: string): Promise<void> {
		const input = this._graphInput;
		if (!input) {
			return;
		}
		const name = await this._quickInputService.input({
			prompt: localize('drox.gitGraph.renamePrompt', "New branch name"),
			value: oldName,
		});
		if (!name?.trim() || name.trim() === oldName) {
			return;
		}
		await this._runOp(
			() => this._gitGraphService.renameBranch(input.folder, oldName, name.trim()),
			localize('drox.gitGraph.branchRenamed', "Renamed to {0}", name.trim()),
		);
	}

	private async _promptAddTag(commitHash: string): Promise<void> {
		const input = this._graphInput;
		if (!input) {
			return;
		}
		const name = await this._quickInputService.input({
			prompt: localize('drox.gitGraph.tagNamePrompt', "Tag name"),
			placeHolder: 'v1.0.0',
		});
		if (!name?.trim()) {
			return;
		}
		await this._runOp(
			() => this._gitGraphService.createTag(input.folder, name.trim(), commitHash),
			localize('drox.gitGraph.tagCreated', "Created tag {0}", name.trim()),
		);
	}

	private async _promptStash(): Promise<void> {
		const input = this._graphInput;
		if (!input) {
			return;
		}
		const message = await this._quickInputService.input({
			prompt: localize('drox.gitGraph.stashMessage', "Stash message (optional)"),
		});
		await this._runOp(
			() => this._gitGraphService.stashPush(input.folder, { message: message?.trim() || undefined, includeUntracked: true }),
			localize('drox.gitGraph.stashed', "Changes stashed"),
		);
	}

	private async _confirmReset(commitHash: string, mode: LocalGitResetMode): Promise<void> {
		const input = this._graphInput;
		if (!input) {
			return;
		}
		await this._confirmOp(
			localize('drox.gitGraph.resetConfirm', "Reset current branch to {0} ({1})?", commitHash.slice(0, 8), mode),
			() => this._gitGraphService.reset(input.folder, commitHash, mode),
		);
	}

	private async _confirmOp(message: string, op: () => Promise<void>): Promise<void> {
		const { confirmed } = await this._dialogService.confirm({ message });
		if (!confirmed) {
			return;
		}
		await this._runOp(op);
	}

	private async _runOp(op: () => Promise<void>, successMessage?: string): Promise<void> {
		try {
			await op();
			if (successMessage) {
				this._notificationService.info(successMessage);
			}
			await this._reload();
		} catch (err) {
			this._notificationService.error(localize('drox.gitGraph.opFailed', "Git operation failed: {0}", String(err)));
		}
	}
}
