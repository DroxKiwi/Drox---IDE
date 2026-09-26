/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, autorun } from '../../../../../base/common/observable.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { MultiDiffEditorInput } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { MultiDiffEditorItem } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffSourceResolverService.js';
import { openDroxSessionFileChange, openDroxSessionChangesFileItem } from '../../../../../workbench/contrib/drox/browser/agents/droxOpenSessionFile.js';
import { DroxChatSessionUri } from '../../../../../workbench/contrib/drox/common/droxAgentsSession.js';
import { droxChangeEventKey } from '../../../../../workbench/contrib/drox/common/droxChangeEventKey.js';
import { createDroxFileChangeCardElement } from '../../../../../workbench/contrib/drox/common/droxFileChangeCardDom.js';
import { IDroxSessionChangesDetailService } from '../../../../../workbench/contrib/drox/common/droxSessionChangesDetailService.js';
import { IDroxSessionChangesPanelService } from '../../../../../workbench/contrib/drox/common/droxSessionChangesPanelService.js';
import { buildAggregatedSessionFileChanges } from '../../../../../workbench/contrib/drox/common/droxSessionChangesAggregate.js';
import { countDroxSessionFileChangeStats } from '../../../../../workbench/contrib/drox/common/droxSessionGitChanges.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionFileChange } from '../../../../services/sessions/common/session.js';
import { getChangesMultiDiffSourceUri } from '../../../changes/browser/changesMultiDiffSourceResolver.js';
import { toIChangesFileItem, IChangesFileItem } from '../../../changes/browser/changesViewRenderer.js';
import { buildDroxCursorStyleDiffDisplay } from './droxChangesDiffDisplay.js';
import { getDroxSessionsProviderInstance } from './droxSessionsProviderAccessor.js';
import './media/droxChangesInlineDiff.css';

const $ = dom.$;

export interface IDroxChangesInlineDiffWidgetOptions {
	readonly parent: HTMLElement;
	readonly sessionResourceObs: IObservable<URI | undefined>;
	/** IDE: git-merged file list when Agents `DroxSessionsProvider` is absent. */
	readonly externalMergedFilesObs?: IObservable<readonly ISessionFileChange[] | undefined>;
}

export class DroxChangesInlineDiffWidget extends Disposable {

	private readonly sessionResourceObs: IObservable<URI | undefined>;
	private readonly externalMergedFilesObs: IObservable<readonly ISessionFileChange[] | undefined> | undefined;

	private readonly _root: HTMLElement;
	private readonly _summaryLabel: HTMLElement;
	private readonly _summaryStats: HTMLElement;
	private readonly _summaryActions: HTMLElement;
	private readonly _cleanBtn: HTMLButtonElement;
	private readonly _dismissSelectedBtn: HTMLButtonElement;
	private readonly _openAllBtn: HTMLButtonElement;
	private readonly _filesListEl: HTMLElement;
	private readonly _filesContainer: HTMLElement;
	private readonly _emptyState: HTMLElement;
	private readonly _selectedKeys = new Set<string>();

	constructor(
		options: IDroxChangesInlineDiffWidgetOptions,
		@IDroxSessionChangesDetailService private readonly detailService: IDroxSessionChangesDetailService,
		@IDroxSessionChangesPanelService private readonly panelService: IDroxSessionChangesPanelService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ILabelService private readonly labelService: ILabelService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IFileService private readonly fileService: IFileService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.sessionResourceObs = options.sessionResourceObs;
		this.externalMergedFilesObs = options.externalMergedFilesObs;
		this._root = dom.append(options.parent, $('.drox-changes-inline'));

		const summary = dom.append(this._root, $('.drox-changes-inline-summary'));
		this._summaryLabel = dom.append(summary, $('span'));
		this._summaryStats = dom.append(summary, $('span.drox-changes-inline-summary-stats'));
		this._summaryActions = dom.append(summary, $('span.drox-changes-inline-summary-actions'));

		this._openAllBtn = dom.append(this._summaryActions, $('button.drox-changes-open-all-btn')) as HTMLButtonElement;
		this._openAllBtn.type = 'button';
		this._openAllBtn.textContent = localize('drox.changes.inline.openAll', 'Open all');
		this._openAllBtn.title = localize('drox.changes.inline.openAllTooltip', 'Open all changes in the multi-diff editor');
		this._openAllBtn.addEventListener('click', () => void this._openAllChanges());

		this._cleanBtn = dom.append(this._summaryActions, $('button.drox-changes-clean-btn')) as HTMLButtonElement;
		this._cleanBtn.type = 'button';
		this._cleanBtn.textContent = localize('drox.changes.inline.clean', 'Clean');
		this._cleanBtn.title = localize('drox.changes.inline.cleanTooltip', 'Clear all changes from this panel');
		this._cleanBtn.addEventListener('click', () => void this._cleanAll());

		this._dismissSelectedBtn = dom.append(this._summaryActions, $('button.drox-changes-dismiss-selected-btn')) as HTMLButtonElement;
		this._dismissSelectedBtn.type = 'button';
		this._dismissSelectedBtn.style.display = 'none';
		this._dismissSelectedBtn.textContent = localize('drox.changes.inline.dismissSelected', 'Dismiss selected');
		this._dismissSelectedBtn.addEventListener('click', () => void this._dismissSelected());

		this._filesListEl = dom.append(this._root, $('div.drox-changes-inline-file-list'));
		this._filesContainer = dom.append(this._root, $('div.drox-changes-inline-files'));
		this._emptyState = dom.append(this._root, $('div.drox-changes-inline-empty'));
		this._emptyState.textContent = localize(
			'drox.changes.inline.emptyHint',
			'Changed files and other session artifacts will appear here.',
		);

		this._register(autorun(reader => {
			this.externalMergedFilesObs?.read(reader);
			this._render(this.sessionResourceObs.read(reader));
		}));

		this._register(this.detailService.onDidChange(() => {
			const current = this.sessionResourceObs.get();
			if (current) {
				this._render(current);
			}
		}));

		this._register(this.panelService.onDidChange(() => {
			const current = this.sessionResourceObs.get();
			if (current) {
				this._render(current);
			}
		}));

		const provider = getDroxSessionsProviderInstance();
		if (provider) {
			this._register(provider.onDidChangeSessions(() => {
				const current = this.sessionResourceObs.get();
				if (current) {
					this._render(current);
				}
			}));
		}
	}

	override dispose(): void {
		this._root.remove();
		super.dispose();
	}

	layout(height: number, _width: number): void {
		this._root.style.minHeight = `${Math.max(0, height)}px`;
	}

	private _render(sessionResource: URI | undefined): void {
		dom.clearNode(this._filesContainer);
		dom.clearNode(this._filesListEl);

		if (!sessionResource) {
			this._setSummaryEmpty();
			return;
		}

		const provider = getDroxSessionsProviderInstance();
		// Prefer git-merged uncommitted set when the provider is available (incl. empty after commit).
		const mergedFiles = provider
			? [...provider.getSessionMergedFileChanges(sessionResource)]
			: this.externalMergedFilesObs?.get();
		const events = provider
			? [...provider.getWorkspaceFileChangeEvents(sessionResource)]
			: this.panelService.filterDismissed(
				sessionResource,
				this.detailService.getSessionChangeEvents(sessionResource),
			);
		const uncommittedFiles = mergedFiles ?? buildAggregatedSessionFileChanges(events);
		if (events.length === 0 && uncommittedFiles.length === 0) {
			this._setSummaryEmpty();
			return;
		}

		this._root.classList.remove('is-empty');
		this._emptyState.style.display = 'none';
		this._cleanBtn.style.removeProperty('display');
		this._openAllBtn.style.display = uncommittedFiles.length > 0 ? '' : 'none';

		const stats = countDroxSessionFileChangeStats(uncommittedFiles);
		this._summaryLabel.textContent = stats.files === 1
			? localize('drox.changes.inline.summaryOneFile', '1 file')
			: localize('drox.changes.inline.summaryNFiles', '{0} files', stats.files);
		dom.clearNode(this._summaryStats);
		const statsParts: string[] = [];
		if (stats.added > 0) {
			statsParts.push(`+${stats.added}`);
		}
		if (stats.removed > 0) {
			statsParts.push(`-${stats.removed}`);
		}
		if (statsParts.length > 0) {
			this._summaryStats.textContent = ` · ${statsParts.join(' ')}`;
		}

		if (uncommittedFiles.length > 0) {
			this._renderFileList(sessionResource, toIChangesFileItem(uncommittedFiles));
		} else {
			this._filesListEl.style.display = 'none';
		}

		for (let i = events.length - 1; i >= 0; i--) {
			const change = events[i]!;
			const key = droxChangeEventKey(change, i);
			this._filesContainer.appendChild(
				createDroxFileChangeCardElement(change, buildDroxCursorStyleDiffDisplay(change), {
					staticFoldBars: true,
					showDismiss: true,
					showSelect: true,
					selected: this._selectedKeys.has(key),
					onDismiss: () => void this._dismissKeys([key]),
					onSelectToggle: selected => {
						if (selected) {
							this._selectedKeys.add(key);
						} else {
							this._selectedKeys.delete(key);
						}
						this._updateSelectionActions();
					},
					onOpenPath: filePath => void this._openFile(filePath, change.toolId),
				}),
			);
		}
		this._updateSelectionActions();
	}

	private _setSummaryEmpty(): void {
		this._root.classList.add('is-empty');
		this._summaryLabel.textContent = localize('drox.changes.inline.summaryEmpty', 'No Uncommitted Changes');
		dom.clearNode(this._summaryStats);
		this._emptyState.style.removeProperty('display');
		this._cleanBtn.style.display = 'none';
		this._openAllBtn.style.display = 'none';
		this._filesListEl.style.display = 'none';
		this._selectedKeys.clear();
		this._updateSelectionActions();
	}

	private _updateSelectionActions(): void {
		this._dismissSelectedBtn.style.display = this._selectedKeys.size > 0 ? '' : 'none';
		if (this._selectedKeys.size > 0) {
			this._dismissSelectedBtn.textContent = this._selectedKeys.size === 1
				? localize('drox.changes.inline.dismissOneSelected', 'Dismiss 1 selected')
				: localize('drox.changes.inline.dismissNSelected', 'Dismiss {0} selected', this._selectedKeys.size);
		}
	}

	private _resolveSessionContext(sessionResource: URI): { engineSessionId: string; workspacePath: string } | undefined {
		const engineSessionId = DroxChatSessionUri.parseSessionId(sessionResource);
		const workspacePath = getDroxSessionsProviderInstance()?.getSessionWorkspacePath(sessionResource)
			?? this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
		if (!engineSessionId || !workspacePath) {
			return undefined;
		}
		return { engineSessionId, workspacePath };
	}

	private _resolveWorkspacePath(sessionResource: URI): string | undefined {
		return getDroxSessionsProviderInstance()?.getSessionWorkspacePath(sessionResource)
			?? this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
	}

	private _currentUncommittedItems(sessionResource: URI): IChangesFileItem[] {
		const provider = getDroxSessionsProviderInstance();
		const mergedFiles = provider
			? [...provider.getSessionMergedFileChanges(sessionResource)]
			: this.externalMergedFilesObs?.get();
		const events = provider
			? [...provider.getWorkspaceFileChangeEvents(sessionResource)]
			: this.panelService.filterDismissed(
				sessionResource,
				this.detailService.getSessionChangeEvents(sessionResource),
			);
		return toIChangesFileItem(mergedFiles ?? buildAggregatedSessionFileChanges(events));
	}

	private _renderFileList(_sessionResource: URI, items: readonly IChangesFileItem[]): void {
		this._filesListEl.style.display = '';
		const header = dom.append(this._filesListEl, $('div.drox-changes-inline-file-list-header'));
		header.textContent = localize('drox.changes.inline.fileListHeader', 'Changed files');
		const list = dom.append(this._filesListEl, $('div.drox-changes-inline-file-list-rows'));
		for (const item of items) {
			const row = dom.append(list, $('div.drox-changes-inline-file-row'));
			const badge = dom.append(row, $('span.changes-decoration-badge'));
			badge.classList.add(
				item.changeType === 'added' ? 'added'
					: item.changeType === 'deleted' ? 'deleted'
						: 'modified',
			);
			badge.textContent = item.changeType === 'added' ? 'A' : item.changeType === 'deleted' ? 'D' : 'M';
			dom.append(row, $('span.drox-changes-inline-file-row-label')).textContent = basename(item.uri);
			const stats = dom.append(row, $('span.drox-changes-inline-file-row-stats'));
			if (item.linesAdded > 0) {
				dom.append(stats, $('span.fc-add')).textContent = `+${item.linesAdded}`;
			}
			if (item.linesRemoved > 0) {
				dom.append(stats, $('span.fc-rem')).textContent = `-${item.linesRemoved}`;
			}
			row.addEventListener('click', () => void this._openFileItem(item, items));
		}
	}

	private async _openFileItem(item: IChangesFileItem, items: readonly IChangesFileItem[]): Promise<void> {
		const sessionResource = this.sessionResourceObs.get();
		if (!sessionResource) {
			return;
		}
		await openDroxSessionChangesFileItem({
			editorService: this.editorService,
			layoutService: this.layoutService,
			labelService: this.labelService,
			detailService: this.detailService,
			fileService: this.fileService,
			contextKeyService: this.contextKeyService,
		}, item, items);
	}

	private async _openAllChanges(): Promise<void> {
		const sessionResource = this.sessionResourceObs.get();
		if (!sessionResource) {
			return;
		}
		this.layoutService.setPartHidden(false, Parts.EDITOR_PART);

		// Agents: reactive multi-diff via ChangesViewModel resolver.
		// IDE: no that resolver — open with an explicit resources list instead.
		if (!getDroxSessionsProviderInstance()) {
			const items = this._currentUncommittedItems(sessionResource);
			if (items.length === 0) {
				return;
			}
			const input = this.instantiationService.createInstance(
				MultiDiffEditorInput,
				URI.parse(`drox-ide-changes:${sessionResource}`),
				localize('drox.changes.inline.multiDiffTitle', 'Session Changes'),
				items.map(item => new MultiDiffEditorItem(
					item.originalUri,
					item.isDeletion ? undefined : item.uri,
					item.uri,
				)),
				true,
			);
			await this.editorService.openEditor(input);
			return;
		}

		await this.editorService.openEditor({
			multiDiffSource: getChangesMultiDiffSourceUri(sessionResource),
			label: localize('drox.changes.inline.multiDiffTitle', 'Session Changes'),
		});
	}

	private async _openFile(filePath: string, toolId?: string): Promise<void> {
		const sessionResource = this.sessionResourceObs.get();
		if (!sessionResource) {
			return;
		}
		const workspacePath = this._resolveWorkspacePath(sessionResource);
		await openDroxSessionFileChange({
			editorService: this.editorService,
			layoutService: this.layoutService,
			labelService: this.labelService,
			detailService: this.detailService,
			fileService: this.fileService,
			contextKeyService: this.contextKeyService,
		}, sessionResource, filePath, workspacePath, toolId);
	}

	private async _dismissKeys(keys: string[]): Promise<void> {
		const sessionResource = this.sessionResourceObs.get();
		if (!sessionResource || keys.length === 0) {
			return;
		}
		const provider = getDroxSessionsProviderInstance();
		if (provider) {
			await provider.dismissWorkspaceChangeKeys(sessionResource, keys);
		} else {
			const ctx = this._resolveSessionContext(sessionResource);
			if (!ctx) {
				return;
			}
			await this.panelService.dismissChanges(sessionResource, ctx.engineSessionId, ctx.workspacePath, keys);
		}
		for (const key of keys) {
			this._selectedKeys.delete(key);
		}
		getDroxSessionsProviderInstance()?.syncSessionChangesFromDetail(sessionResource);
		this._render(sessionResource);
	}

	private async _dismissSelected(): Promise<void> {
		await this._dismissKeys([...this._selectedKeys]);
	}

	private async _cleanAll(): Promise<void> {
		const sessionResource = this.sessionResourceObs.get();
		if (!sessionResource) {
			return;
		}
		const provider = getDroxSessionsProviderInstance();
		if (provider) {
			await provider.cleanWorkspaceChangeHistory(sessionResource);
		} else {
			const ctx = this._resolveSessionContext(sessionResource);
			if (!ctx) {
				return;
			}
			await this.panelService.cleanAllChanges(sessionResource, ctx.engineSessionId, ctx.workspacePath);
			getDroxSessionsProviderInstance()?.syncSessionChangesFromDetail(sessionResource);
		}
		this._selectedKeys.clear();
		this._render(sessionResource);
	}
}
