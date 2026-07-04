/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// allow-any-unicode-comment-file



import { URI } from '../../../../base/common/uri.js';

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';

import { DroxChatSessionUri } from './droxAgentsSession.js';

import { IDroxSessionListEntry, isListableDroxSessionId } from './droxSession.js';



/** Même clé que {@link SessionsRecencyHistory} (fenêtre Agents). */

export const DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY = 'agentSessions.recencyHistory';



/** Dernière session moteur par workspace — scope profil (IDE ↔ Agents, même si workspace Agents vide). */

export const DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY = 'drox.chat.workspaceSessionRecency';



const MAX_SHARED_RECENCY_ENTRIES = 50;



interface IDroxWorkspaceSessionRecencyEntry {

	readonly sessionId: string;

	readonly sessionOrder?: readonly string[];

	readonly updatedAt: number;

}



interface IDroxWorkspaceSessionRecencyMemento {

	readonly byWorkspace?: Record<string, IDroxWorkspaceSessionRecencyEntry>;

}



interface ISerializedRecencyEntry {

	readonly session?: string;

	readonly chat?: string;

}



function normalizeWorkspaceKey(workspaceFsPath: string): string {

	return workspaceFsPath.replace(/\\/g, '/').toLowerCase();

}



function readWorkspaceRecencyMemento(storageService: IStorageService): IDroxWorkspaceSessionRecencyMemento {

	const raw = storageService.get(DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY, StorageScope.PROFILE);

	if (!raw) {

		return {};

	}

	try {

		const parsed = JSON.parse(raw) as IDroxWorkspaceSessionRecencyMemento;

		return parsed && typeof parsed === 'object' ? parsed : {};

	} catch {

		return {};

	}

}



function writeWorkspaceRecencyMemento(storageService: IStorageService, memento: IDroxWorkspaceSessionRecencyMemento): void {

	storageService.store(

		DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY,

		JSON.stringify(memento),

		StorageScope.PROFILE,

		StorageTarget.USER,

	);

}



function readWorkspaceRecencyEntries(storageService: IStorageService): ISerializedRecencyEntry[] {

	const raw = storageService.get(DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY, StorageScope.WORKSPACE);

	if (!raw) {

		return [];

	}

	try {

		const parsed = JSON.parse(raw) as ISerializedRecencyEntry[];

		return Array.isArray(parsed) ? parsed : [];

	} catch {

		return [];

	}

}



function writeWorkspaceRecencyEntries(storageService: IStorageService, entries: readonly ISerializedRecencyEntry[]): void {

	if (entries.length === 0) {

		storageService.remove(DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY, StorageScope.WORKSPACE);

		return;

	}

	storageService.store(

		DROX_AGENT_SESSIONS_RECENCY_STORAGE_KEY,

		JSON.stringify(entries),

		StorageScope.WORKSPACE,

		StorageTarget.MACHINE,

	);

}



function engineSessionIdFromRecencyUri(sessionUri: string): string | undefined {

	try {

		const resource = URI.parse(sessionUri);

		const id = DroxChatSessionUri.parseSessionId(resource);

		return id && isListableDroxSessionId(id) ? id : undefined;

	} catch {

		return undefined;

	}

}



function promoteSessionIdOrder(order: readonly string[], sessionId: string): string[] {

	const next = order.filter(id => id !== sessionId);

	next.unshift(sessionId);

	if (next.length > MAX_SHARED_RECENCY_ENTRIES) {

		next.length = MAX_SHARED_RECENCY_ENTRIES;

	}

	return next;

}



function promoteRecencyEntries(

	entries: readonly ISerializedRecencyEntry[],

	sessionResource: URI,

): ISerializedRecencyEntry[] {

	const sessionStr = sessionResource.toString();

	const next = entries.filter(e => e?.session !== sessionStr);

	next.unshift({ session: sessionStr });

	if (next.length > MAX_SHARED_RECENCY_ENTRIES) {

		next.length = MAX_SHARED_RECENCY_ENTRIES;

	}

	return next;

}



function pushRecencyId(order: string[], seen: Set<string>, id: string | undefined): void {

	if (!id || !isListableDroxSessionId(id) || seen.has(id)) {

		return;

	}

	seen.add(id);

	order.push(id);

}



/** Ordre MRU partagé IDE Native / webview / fenêtre Agents pour ce workspace. */

export function readDroxEngineSessionRecency(

	storageService: IStorageService,

	workspaceFsPath: string,

): readonly string[] {

	const key = normalizeWorkspaceKey(workspaceFsPath);

	const order: string[] = [];

	const seen = new Set<string>();



	const profileEntry = readWorkspaceRecencyMemento(storageService).byWorkspace?.[key];

	if (profileEntry?.sessionOrder) {

		for (const id of profileEntry.sessionOrder) {

			pushRecencyId(order, seen, id);

		}

	}

	pushRecencyId(order, seen, profileEntry?.sessionId);



	for (const entry of readWorkspaceRecencyEntries(storageService)) {

		if (!entry || typeof entry.session !== 'string') {

			continue;

		}

		pushRecencyId(order, seen, engineSessionIdFromRecencyUri(entry.session));

	}



	return order;

}



/** Lit la dernière session Drox ouverte pour ce workspace (profil, puis recency Agents). */

export function readLastDroxEngineSessionId(

	storageService: IStorageService,

	workspaceFsPath: string,

): string | undefined {

	return readDroxEngineSessionRecency(storageService, workspaceFsPath)[0];

}



/** Trie les entrées disque selon l’ordre MRU partagé, puis `modifiedSecs`. */

export function sortDroxSessionEntriesByRecency(

	entries: readonly IDroxSessionListEntry[],

	recencyIds: readonly string[],

): IDroxSessionListEntry[] {

	const rank = new Map(recencyIds.map((id, index) => [id, index]));

	return [...entries].sort((a, b) => {

		const ra = rank.get(a.id);

		const rb = rank.get(b.id);

		if (ra !== undefined && rb !== undefined) {

			return ra - rb;

		}

		if (ra !== undefined) {

			return -1;

		}

		if (rb !== undefined) {

			return 1;

		}

		return b.modifiedSecs - a.modifiedSecs || b.sizeBytes - a.sizeBytes;

	});

}



/** Enregistre l’ouverture d’une session moteur (partagé IDE Native / webview ↔ fenêtre Agents). */

export function markDroxEngineSessionOpened(

	storageService: IStorageService,

	workspaceFsPath: string,

	engineSessionId: string,

): void {

	if (!isListableDroxSessionId(engineSessionId)) {

		return;

	}

	const key = normalizeWorkspaceKey(workspaceFsPath);

	const memento = readWorkspaceRecencyMemento(storageService);

	const byWorkspace = { ...(memento.byWorkspace ?? {}) };

	const prev = byWorkspace[key];

	const sessionOrder = promoteSessionIdOrder(prev?.sessionOrder ?? [], engineSessionId);

	byWorkspace[key] = { sessionId: engineSessionId, sessionOrder, updatedAt: Date.now() };

	writeWorkspaceRecencyMemento(storageService, { byWorkspace });



	const sessionResource = DroxChatSessionUri.forSession(engineSessionId);

	writeWorkspaceRecencyEntries(

		storageService,

		promoteRecencyEntries(readWorkspaceRecencyEntries(storageService), sessionResource),

	);

}

/** Retire une session moteur des MRU partagés (profil + workspace). */
export function removeDroxEngineSessionFromRecency(
	storageService: IStorageService,
	workspaceFsPath: string,
	engineSessionId: string,
): void {
	if (!isListableDroxSessionId(engineSessionId)) {
		return;
	}

	const sessionResource = DroxChatSessionUri.forSession(engineSessionId);
	const sessionStr = sessionResource.toString();
	writeWorkspaceRecencyEntries(
		storageService,
		readWorkspaceRecencyEntries(storageService).filter(entry => entry?.session !== sessionStr),
	);

	const key = normalizeWorkspaceKey(workspaceFsPath);
	const memento = readWorkspaceRecencyMemento(storageService);
	const prev = memento.byWorkspace?.[key];
	if (!prev) {
		return;
	}

	const sessionOrder = (prev.sessionOrder ?? []).filter(id => id !== engineSessionId);
	let sessionId = prev.sessionId;
	if (sessionId === engineSessionId) {
		sessionId = sessionOrder[0] ?? '';
	}

	const nextByWorkspace = { ...(memento.byWorkspace ?? {}) };
	if (!sessionId && sessionOrder.length === 0) {
		delete nextByWorkspace[key];
	} else {
		nextByWorkspace[key] = { sessionId, sessionOrder, updatedAt: Date.now() };
	}
	writeWorkspaceRecencyMemento(storageService, { byWorkspace: nextByWorkspace });
}

/** Efface l'historique MRU Drox (profil + workspace) pour un workspace donné. */
export function clearDroxEngineSessionRecency(
	storageService: IStorageService,
	workspaceFsPath: string,
): void {
	const key = normalizeWorkspaceKey(workspaceFsPath);

	const memento = readWorkspaceRecencyMemento(storageService);
	if (memento.byWorkspace && key in memento.byWorkspace) {
		const nextByWorkspace = { ...memento.byWorkspace };
		delete nextByWorkspace[key];
		writeWorkspaceRecencyMemento(storageService, { byWorkspace: nextByWorkspace });
	}

	writeWorkspaceRecencyEntries(storageService, []);
}


