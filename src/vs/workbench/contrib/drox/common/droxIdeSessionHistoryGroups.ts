/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { generateUuid } from '../../../../base/common/uuid.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

/** Groupes d’historique chat IDE (workspace scope — dossier ouvert). */
export const DROX_IDE_SESSION_HISTORY_GROUPS_STORAGE_KEY = 'drox.ide.sessionHistoryGroups';

export interface IDroxIdeSessionHistoryGroup {
	readonly id: string;
	readonly name: string;
	readonly sessionIds: readonly string[];
}

interface IDroxIdeSessionHistoryGroupsMemento {
	readonly groups?: readonly IDroxIdeSessionHistoryGroup[];
}

export function readDroxIdeSessionHistoryGroups(
	storageService: IStorageService,
): IDroxIdeSessionHistoryGroup[] {
	const raw = storageService.get(DROX_IDE_SESSION_HISTORY_GROUPS_STORAGE_KEY, StorageScope.WORKSPACE);
	if (!raw) {
		return [];
	}
	try {
		const parsed = JSON.parse(raw) as IDroxIdeSessionHistoryGroupsMemento;
		if (!parsed?.groups || !Array.isArray(parsed.groups)) {
			return [];
		}
		return parsed.groups
			.filter(g => g && typeof g.id === 'string' && typeof g.name === 'string' && Array.isArray(g.sessionIds))
			.map(g => ({
				id: g.id,
				name: g.name.trim() || g.id,
				sessionIds: (g.sessionIds as unknown[]).filter((id): id is string => typeof id === 'string' && id.length > 0),
			}));
	} catch {
		return [];
	}
}

function writeGroups(storageService: IStorageService, groups: readonly IDroxIdeSessionHistoryGroup[]): void {
	if (groups.length === 0) {
		storageService.remove(DROX_IDE_SESSION_HISTORY_GROUPS_STORAGE_KEY, StorageScope.WORKSPACE);
		return;
	}
	storageService.store(
		DROX_IDE_SESSION_HISTORY_GROUPS_STORAGE_KEY,
		JSON.stringify({ groups } satisfies IDroxIdeSessionHistoryGroupsMemento),
		StorageScope.WORKSPACE,
		StorageTarget.USER,
	);
}

/** Retire les ids absents de la liste courante (après delete). */
export function pruneDroxIdeSessionHistoryGroups(
	storageService: IStorageService,
	knownSessionIds: ReadonlySet<string>,
): IDroxIdeSessionHistoryGroup[] {
	const next = readDroxIdeSessionHistoryGroups(storageService)
		.map(g => ({
			...g,
			sessionIds: g.sessionIds.filter(id => knownSessionIds.has(id)),
		}))
		.filter(g => g.sessionIds.length > 0);
	writeGroups(storageService, next);
	return next;
}

export function createDroxIdeSessionHistoryGroup(
	storageService: IStorageService,
	name: string,
	sessionIds: readonly string[],
): IDroxIdeSessionHistoryGroup {
	const ids = [...new Set(sessionIds.filter(Boolean))];
	const groups = readDroxIdeSessionHistoryGroups(storageService)
		.map(g => ({
			...g,
			sessionIds: g.sessionIds.filter(id => !ids.includes(id)),
		}))
		.filter(g => g.sessionIds.length > 0);

	const group: IDroxIdeSessionHistoryGroup = {
		id: generateUuid(),
		name: name.trim() || 'Group',
		sessionIds: ids,
	};
	writeGroups(storageService, [...groups, group]);
	return group;
}

export function removeSessionsFromDroxIdeHistoryGroups(
	storageService: IStorageService,
	sessionIds: readonly string[],
): void {
	const remove = new Set(sessionIds);
	if (remove.size === 0) {
		return;
	}
	const next = readDroxIdeSessionHistoryGroups(storageService)
		.map(g => ({
			...g,
			sessionIds: g.sessionIds.filter(id => !remove.has(id)),
		}))
		.filter(g => g.sessionIds.length > 0);
	writeGroups(storageService, next);
}

export function getDroxIdeHistoryGroupOfSession(
	groups: readonly IDroxIdeSessionHistoryGroup[],
	sessionId: string,
): IDroxIdeSessionHistoryGroup | undefined {
	return groups.find(g => g.sessionIds.includes(sessionId));
}
