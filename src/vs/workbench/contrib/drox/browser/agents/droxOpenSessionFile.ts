/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ACTIVE_GROUP } from '../../../../services/editor/common/editorService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { Parts } from '../../../../services/layout/browser/layoutService.js';
import { IWorkbenchLayoutService } from '../../../../services/layout/browser/layoutService.js';
import { ModifiedFileEntryState } from '../../../chat/common/editing/chatEditingService.js';
import { getChangesEditorLabels } from '../../../../../sessions/contrib/changes/browser/changesEditorLabels.js';
import { IChangesFileItem, toIChangesFileItem } from '../../../../../sessions/contrib/changes/browser/changesViewRenderer.js';
import '../../../../../sessions/contrib/changes/browser/media/changesView.css';
import './media/droxNativeFileChange.css';
import { enrichDroxFileChangeSnapshot } from '../../common/droxFileChangeProgress.js';
import { IDroxSessionChangesDetailService } from '../../common/droxSessionChangesDetailService.js';
import { buildAggregatedSessionFileChanges } from '../../common/droxSessionChangesAggregate.js';
import { resolveWorkspaceFilePath } from '../../common/droxFileChange.js';
import { sanitizePathForEditor } from '../../common/droxPathUtil.js';
import { getDroxSessionsProviderInstance } from '../../../../../sessions/contrib/providers/drox/browser/droxSessionsProviderAccessor.js';

const $ = dom.$;

export interface IDroxOpenSessionFileDeps {
	readonly editorService: IEditorService;
	readonly layoutService: IWorkbenchLayoutService;
	readonly labelService: ILabelService;
	readonly detailService: IDroxSessionChangesDetailService;
	readonly fileService: IFileService;
	readonly contextKeyService: IContextKeyService;
}

function buildSessionChangeItems(
	detailService: IDroxSessionChangesDetailService,
	sessionResource: URI,
	workspaceRoot: string | undefined,
): IChangesFileItem[] {
	const provider = getDroxSessionsProviderInstance();
	// Provider present → use git-merged changes (including empty after commit).
	// Do not fall back to agent event history, which stays stale after commit/push.
	if (provider) {
		return toIChangesFileItem([...provider.getSessionMergedFileChanges(sessionResource)]);
	}
	const events = detailService.getSessionChangeEvents(sessionResource)
		.map(change => enrichDroxFileChangeSnapshot(change, workspaceRoot));
	return toIChangesFileItem(buildAggregatedSessionFileChanges(events));
}

async function canOpenOriginalForDiff(deps: IDroxOpenSessionFileDeps, originalUri: URI): Promise<boolean> {
	if (originalUri.scheme === 'git') {
		return true;
	}
	if (originalUri.scheme === 'file') {
		return deps.fileService.exists(originalUri);
	}
	return true;
}

async function resolveItemForOpen(deps: IDroxOpenSessionFileDeps, item: IChangesFileItem): Promise<IChangesFileItem> {
	if (!item.originalUri || item.isDeletion) {
		return item;
	}
	if (await canOpenOriginalForDiff(deps, item.originalUri)) {
		return item;
	}
	return { ...item, originalUri: undefined, changeType: item.changeType === 'added' ? 'added' : 'modified' };
}

function applyToolSnapshot(
	item: IChangesFileItem,
	toolId: string | undefined,
	detailService: IDroxSessionChangesDetailService,
	sessionResource: URI,
	workspaceRoot: string | undefined,
): IChangesFileItem {
	if (!toolId) {
		return item;
	}
	const event = detailService.getSessionChangeEvents(sessionResource)
		.map(change => enrichDroxFileChangeSnapshot(change, workspaceRoot))
		.find(change => change.toolId === toolId);
	if (!event?.beforeSnapshotUri) {
		return item;
	}
	const originalUri = URI.parse(event.beforeSnapshotUri);
	return { ...item, originalUri };
}

async function applyToolSnapshotAsync(
	item: IChangesFileItem,
	toolId: string | undefined,
	detailService: IDroxSessionChangesDetailService,
	sessionResource: URI,
	workspaceRoot: string | undefined,
	deps: IDroxOpenSessionFileDeps,
): Promise<IChangesFileItem> {
	if (!toolId) {
		return item;
	}
	const withSnapshot = applyToolSnapshot(item, toolId, detailService, sessionResource, workspaceRoot);
	return resolveItemForOpen(deps, withSnapshot);
}

function renderChangesSidebar(
	container: HTMLElement,
	items: readonly IChangesFileItem[],
	activeItem: IChangesFileItem,
	onOpen: (item: IChangesFileItem) => void,
): IDisposable {
	const disposables = new DisposableStore();
	container.classList.add('changes-file-list', 'list-mode');

	const headerNode = dom.append(container, $('.changes-sidebar-header'));
	dom.append(headerNode, $('span')).textContent = localize('changes', 'Changes');
	const count = dom.append(headerNode, $('span.changes-sidebar-count'));
	count.textContent = String(items.length);

	const list = dom.append(container, $('.drox-session-changes-sidebar-list'));
	const renderRows = () => {
		dom.clearNode(list);
		for (const item of items) {
			const row = dom.append(list, $('.drox-session-changes-sidebar-row'));
			row.classList.toggle('active', isEqual(item.uri, activeItem.uri));

			const badge = dom.append(row, $('span.changes-decoration-badge'));
			badge.classList.add(
				item.changeType === 'added' ? 'added'
					: item.changeType === 'deleted' ? 'deleted'
						: 'modified',
			);
			badge.textContent = item.changeType === 'added' ? 'A' : item.changeType === 'deleted' ? 'D' : 'M';

			dom.append(row, $('span.drox-session-changes-sidebar-label')).textContent = basename(item.uri);
			row.onclick = () => onOpen(item);
		}
	};
	renderRows();
	return disposables;
}

async function openChangesFileItem(
	deps: IDroxOpenSessionFileDeps,
	item: IChangesFileItem,
	items: readonly IChangesFileItem[],
	includeSidebar: boolean,
): Promise<void> {
	const currentIndex = items.indexOf(item);
	const sidebar = includeSidebar && items.length > 0 ? {
		render: (container: unknown, _onDidLayout: unknown, contextKeyService: IContextKeyService) => {
			return renderChangesSidebar(
				container as HTMLElement,
				items,
				item,
				target => void openChangesFileItem(deps, target, items, includeSidebar),
			);
		},
	} : undefined;

	const navigation = items.length > 1 ? {
		total: items.length,
		current: Math.max(0, currentIndex),
		navigate: (index: number) => {
			const target = items[index];
			if (target) {
				void openChangesFileItem(deps, target, items, includeSidebar);
			}
		},
	} : undefined;

	const labels = getChangesEditorLabels(item.uri, deps.labelService);
	const modal = sidebar || navigation ? { sidebar, navigation } : undefined;
	const options = { pinned: true, modal };

	const resolved = await resolveItemForOpen(deps, item);

	if (resolved.isDeletion && resolved.originalUri) {
		await deps.editorService.openEditor({
			resource: resolved.originalUri,
			...labels,
			options,
		}, ACTIVE_GROUP);
		return;
	}

	if (resolved.originalUri) {
		await deps.editorService.openEditor({
			original: { resource: resolved.originalUri },
			modified: { resource: resolved.uri },
			...labels,
			options,
		}, ACTIVE_GROUP);
		return;
	}

	await deps.editorService.openEditor({
		resource: resolved.uri,
		...labels,
		options,
	}, ACTIVE_GROUP);
}

export async function openDroxSessionChangesFileItem(
	deps: IDroxOpenSessionFileDeps,
	item: IChangesFileItem,
	items: readonly IChangesFileItem[],
): Promise<void> {
	deps.layoutService.setPartHidden(false, Parts.EDITOR_PART);
	const includeSidebar = items.length > 1;
	await openChangesFileItem(deps, item, items.length > 0 ? items : [item], includeSidebar);
}

export async function openDroxSessionFileChange(
	deps: IDroxOpenSessionFileDeps,
	sessionResource: URI,
	filePath: string,
	workspaceRoot: string | undefined,
	toolId?: string,
): Promise<void> {
	const resolved = resolveWorkspaceFilePath(workspaceRoot, filePath) || filePath;
	const safePath = sanitizePathForEditor(resolved);
	if (!safePath) {
		return;
	}

	deps.layoutService.setPartHidden(false, Parts.EDITOR_PART);

	const fileUri = URI.file(safePath);
	const items = buildSessionChangeItems(deps.detailService, sessionResource, workspaceRoot);
	let target = items.find(item => isEqual(item.uri, fileUri));

	if (!target) {
		target = {
			type: 'file',
			uri: fileUri,
			state: ModifiedFileEntryState.Accepted,
			isDeletion: false,
			changeType: 'modified',
			linesAdded: 0,
			linesRemoved: 0,
		};
	} else {
		target = await applyToolSnapshotAsync(target, toolId, deps.detailService, sessionResource, workspaceRoot, deps);
	}

	const includeSidebar = items.length > 1;
	await openChangesFileItem(deps, target, items.length > 0 ? items : [target], includeSidebar);
}
