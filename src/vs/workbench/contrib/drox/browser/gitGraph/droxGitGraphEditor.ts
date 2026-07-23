/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import './media/droxGitGraph.css';
import { $, addDisposableListener, clearNode, Dimension, EventType } from '../../../../../base/browser/dom.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { EditorPane } from '../../../../browser/parts/editor/editorPane.js';
import { IEditorOpenContext } from '../../../../common/editor.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { ILocalGitRef } from '../../../../../platform/git/common/localGitService.js';
import { IDroxGitGraphService, IDroxGitGraphWindow } from '../../common/droxGitGraphService.js';
import { DROX_GIT_GRAPH_EDITOR_ID, DroxGitGraphInput } from './droxGitGraphInput.js';

export class DroxGitGraphEditor extends EditorPane {

	static readonly ID = DROX_GIT_GRAPH_EDITOR_ID;

	private _container!: HTMLElement;
	private _toolbarEl!: HTMLElement;
	private _listEl!: HTMLElement;
	private readonly _contentDisposables = this._register(new DisposableStore());
	private _graphInput: DroxGitGraphInput | undefined;

	constructor(
		group: IEditorGroup,
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IDroxGitGraphService private readonly _gitGraphService: IDroxGitGraphService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super(DroxGitGraphEditor.ID, group, telemetryService, themeService, storageService);
	}

	protected createEditor(parent: HTMLElement): void {
		this._container = $('div.drox-git-graph');
		this._toolbarEl = $('div.drox-git-graph-toolbar');
		this._listEl = $('div.drox-git-graph-list');
		this._container.appendChild(this._toolbarEl);
		this._container.appendChild(this._listEl);
		parent.appendChild(this._container);
	}

	override async setInput(input: DroxGitGraphInput, options: IEditorOptions | undefined, context: IEditorOpenContext, token: CancellationToken): Promise<void> {
		await super.setInput(input, options, context, token);
		this._graphInput = input;
		await this._reload();
	}

	override clearInput(): void {
		this._graphInput = undefined;
		this._contentDisposables.clear();
		clearNode(this._toolbarEl);
		clearNode(this._listEl);
		super.clearInput();
	}

	override layout(dimension: Dimension): void {
		this._container.style.height = `${dimension.height}px`;
		this._container.style.width = `${dimension.width}px`;
	}

	private async _reload(): Promise<void> {
		this._contentDisposables.clear();
		clearNode(this._toolbarEl);
		clearNode(this._listEl);

		const input = this._graphInput;
		if (!input) {
			return;
		}

		const refreshBtn = $('button.drox-git-graph-refresh');
		refreshBtn.textContent = localize('drox.gitGraph.refresh', "Refresh");
		this._toolbarEl.appendChild(refreshBtn);
		this._contentDisposables.add(addDisposableListener(refreshBtn, EventType.CLICK, () => {
			void this._reload();
		}));

		const loading = $('div.drox-git-graph-loading');
		loading.textContent = localize('drox.gitGraph.loading', "Loading repository…");
		this._listEl.appendChild(loading);

		let window: IDroxGitGraphWindow | undefined;
		try {
			window = await this._gitGraphService.getGraphWindow(input.folder);
		} catch (err) {
			this._notificationService.error(localize('drox.gitGraph.loadFailed', "Failed to load Git Graph: {0}", String(err)));
			return;
		}

		if (!window) {
			clearNode(this._listEl);
			const empty = $('div.drox-git-graph-empty');
			empty.textContent = localize('drox.gitGraph.notRepo', "This folder is not a git repository.");
			this._listEl.appendChild(empty);
			return;
		}

		const branchLabel = $('span.drox-git-graph-current-branch');
		branchLabel.textContent = window.currentBranch
			? localize('drox.gitGraph.onBranch', "On {0}", window.currentBranch)
			: localize('drox.gitGraph.detached', "Detached HEAD");
		this._toolbarEl.appendChild(branchLabel);

		clearNode(this._listEl);
		this._renderWindow(window);
	}

	private _renderWindow(window: IDroxGitGraphWindow): void {
		const refsByHash = new Map<string, ILocalGitRef[]>();
		for (const ref of window.refs) {
			const list = refsByHash.get(ref.hash) ?? [];
			list.push(ref);
			refsByHash.set(ref.hash, list);
		}

		if (window.status.uncommittedCount > 0) {
			const row = this._createRow({
				hash: '',
				subject: localize('drox.gitGraph.uncommitted', "Uncommitted Changes ({0})", window.status.uncommittedCount),
				authorName: '',
				authorDateSeconds: 0,
				openNode: true,
			});
			this._listEl.appendChild(row);
		}

		for (const commit of window.commits) {
			const refs = refsByHash.get(commit.hash) ?? [];
			const row = this._createRow({
				hash: commit.hash,
				subject: commit.subject,
				authorName: commit.authorName,
				authorDateSeconds: commit.authorDateSeconds,
				refs,
				currentBranch: window.currentBranch,
			});
			this._listEl.appendChild(row);
		}
	}

	private _createRow(opts: {
		readonly hash: string;
		readonly subject: string;
		readonly authorName: string;
		readonly authorDateSeconds: number;
		readonly refs?: readonly ILocalGitRef[];
		readonly currentBranch?: string;
		readonly openNode?: boolean;
	}): HTMLElement {
		const row = $('div.drox-git-graph-row');
		const graph = $('div.drox-git-graph-node');
		graph.classList.toggle('open', !!opts.openNode);
		row.appendChild(graph);

		const desc = $('div.drox-git-graph-desc');
		const pills = $('div.drox-git-graph-pills');
		for (const ref of opts.refs ?? []) {
			const pill = $('span.drox-git-graph-pill');
			pill.classList.add(`kind-${ref.kind}`);
			if (ref.kind === 'head' && ref.name === opts.currentBranch) {
				pill.classList.add('current');
			}
			pill.textContent = ref.name;
			pill.title = localize('drox.gitGraph.pillHint', "Double-click to checkout {0}", ref.name);
			if (ref.kind === 'head' || ref.kind === 'remote') {
				this._contentDisposables.add(addDisposableListener(pill, EventType.DBLCLICK, e => {
					e.preventDefault();
					e.stopPropagation();
					void this._checkout(ref.name, ref.kind === 'remote');
				}));
			}
			pills.appendChild(pill);
		}
		if (opts.refs?.length) {
			desc.appendChild(pills);
		}

		const subject = $('div.drox-git-graph-subject');
		subject.textContent = opts.subject;
		desc.appendChild(subject);
		row.appendChild(desc);

		const meta = $('div.drox-git-graph-meta');
		if (opts.authorDateSeconds) {
			const date = $('span.drox-git-graph-date');
			date.textContent = new Date(opts.authorDateSeconds * 1000).toLocaleString();
			meta.appendChild(date);
		}
		if (opts.authorName) {
			const author = $('span.drox-git-graph-author');
			author.textContent = opts.authorName;
			meta.appendChild(author);
		}
		if (opts.hash) {
			const hash = $('span.drox-git-graph-hash');
			hash.textContent = opts.hash.slice(0, 8);
			meta.appendChild(hash);
		}
		row.appendChild(meta);
		return row;
	}

	private async _checkout(refName: string, isRemote: boolean): Promise<void> {
		const input = this._graphInput;
		if (!input) {
			return;
		}
		let branch = refName;
		if (isRemote) {
			// origin/foo → prefer local foo if present, else checkout remote-tracking (detached risk).
			const slash = refName.indexOf('/');
			branch = slash >= 0 ? refName.slice(slash + 1) : refName;
		}
		try {
			await this._gitGraphService.checkoutBranch(input.folder, branch);
			this._notificationService.info(localize('drox.gitGraph.checkedOut', "Checked out {0}", branch));
			await this._reload();
		} catch (err) {
			this._notificationService.error(localize('drox.gitGraph.checkoutFailed', "Checkout failed: {0}", String(err)));
		}
	}
}
