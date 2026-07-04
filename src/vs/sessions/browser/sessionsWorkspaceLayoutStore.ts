/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../platform/storage/common/storage.js';

export const SESSIONS_LAYOUT_BY_WORKSPACE_KEY = 'workbench.sessions.layoutByWorkspace';

/** Stable key for the Drox Agents window (global layout, independent of project/session). */
export const SESSIONS_AGENTS_WINDOW_LAYOUT_KEY = '__agents_window__';
/** Legacy flat keys — migrated into {@link SESSIONS_LAYOUT_BY_WORKSPACE_KEY}. */
const LEGACY_PART_VISIBILITY_KEY = 'workbench.sessions.partVisibility';
const LEGACY_PART_SIZES_KEY = 'workbench.sessions.partSizes';

/** Marker entry until the first real workspace folder is known. */
export const SESSIONS_LAYOUT_LEGACY_GLOBAL_KEY = '__legacy_global__';

export interface ISessionsPartVisibilitySnapshot {
	readonly editor?: boolean;
	readonly auxiliaryBar?: boolean;
	readonly sidebar?: boolean;
	readonly panel?: boolean;
}

export interface ISessionsPartSizesSnapshot {
	readonly sidebar?: number;
	readonly auxiliaryBar?: number;
	readonly sessions?: number;
	readonly editor?: number;
	readonly panel?: number;
}

export interface ISessionsWorkspaceLayoutSnapshot {
	readonly partVisibility?: ISessionsPartVisibilitySnapshot;
	readonly partSizes?: ISessionsPartSizesSnapshot;
}

export type ISessionsLayoutByWorkspaceMemento = Record<string, ISessionsWorkspaceLayoutSnapshot>;

export function sessionsWorkspaceLayoutKey(fsPath: string): string {
	return fsPath.trim().replace(/\\/g, '/').toLowerCase();
}
export function loadSessionsLayoutByWorkspaceMemento(storageService: IStorageService): ISessionsLayoutByWorkspaceMemento {
	const memento = parseMemento(storageService.get(SESSIONS_LAYOUT_BY_WORKSPACE_KEY, StorageScope.WORKSPACE));
	if (memento[SESSIONS_LAYOUT_LEGACY_GLOBAL_KEY]) {
		return memento;
	}

	const legacyVisibility = storageService.get(LEGACY_PART_VISIBILITY_KEY, StorageScope.WORKSPACE);
	const legacySizes = storageService.get(LEGACY_PART_SIZES_KEY, StorageScope.WORKSPACE);
	if (!legacyVisibility && !legacySizes) {
		return memento;
	}

	let partVisibility: ISessionsPartVisibilitySnapshot | undefined;
	let partSizes: ISessionsPartSizesSnapshot | undefined;
	try {
		if (legacyVisibility) {
			partVisibility = JSON.parse(legacyVisibility);
		}
	} catch {
		storageService.remove(LEGACY_PART_VISIBILITY_KEY, StorageScope.WORKSPACE);
	}
	try {
		if (legacySizes) {
			partSizes = JSON.parse(legacySizes);
		}
	} catch {
		storageService.remove(LEGACY_PART_SIZES_KEY, StorageScope.WORKSPACE);
	}

	if (partVisibility || partSizes) {
		memento[SESSIONS_LAYOUT_LEGACY_GLOBAL_KEY] = { partVisibility, partSizes };
		storageService.remove(LEGACY_PART_VISIBILITY_KEY, StorageScope.WORKSPACE);
		storageService.remove(LEGACY_PART_SIZES_KEY, StorageScope.WORKSPACE);
	}

	return memento;
}

export function saveSessionsLayoutByWorkspaceMemento(
	storageService: IStorageService,
	memento: ISessionsLayoutByWorkspaceMemento,
): void {
	const cleaned = { ...memento };
	if (Object.keys(cleaned).length === 0) {
		storageService.remove(SESSIONS_LAYOUT_BY_WORKSPACE_KEY, StorageScope.WORKSPACE);
		return;
	}
	storageService.store(
		SESSIONS_LAYOUT_BY_WORKSPACE_KEY,
		JSON.stringify(cleaned),
		StorageScope.WORKSPACE,
		StorageTarget.MACHINE,
	);
}

export function resolveSessionsWorkspaceLayoutSnapshot(
	memento: ISessionsLayoutByWorkspaceMemento,
	workspaceKey: string | undefined,
): ISessionsWorkspaceLayoutSnapshot | undefined {
	if (!workspaceKey) {
		return undefined;
	}
	if (memento[workspaceKey]) {
		return memento[workspaceKey];
	}
	const legacy = memento[SESSIONS_LAYOUT_LEGACY_GLOBAL_KEY];
	if (!legacy) {
		return undefined;
	}
	memento[workspaceKey] = legacy;
	delete memento[SESSIONS_LAYOUT_LEGACY_GLOBAL_KEY];
	return legacy;
}

function parseMemento(raw: string | undefined): ISessionsLayoutByWorkspaceMemento {
	if (!raw) {
		return {};
	}
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as ISessionsLayoutByWorkspaceMemento;
		}
	} catch {
		// drop corrupted memento on next save
	}
	return {};
}
