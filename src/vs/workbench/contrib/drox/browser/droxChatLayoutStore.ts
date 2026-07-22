/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindowId } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { Memento } from '../../../common/memento.js';

export const DROX_CHAT_LAYOUT_STORAGE_KEY = 'drox.chat.layout';

export const DROX_CHAT_LAYOUT_VERSION = 1;

/** Clé memento : layout par fenêtre (évite de mélanger deux fenêtres ouvertes en parallèle). */
export function droxChatLayoutMementoId(windowId: number): string {
	return `${DROX_CHAT_LAYOUT_STORAGE_KEY}.w${windowId}`;
}

/**
 * Clé memento stable au cold boot — l’ID fenêtre Electron change à chaque lancement,
 * donc `w{N}` seul ne survit pas à une réouverture de l’app.
 */
export const DROX_CHAT_LAYOUT_LAST_MEMENTO_ID = `${DROX_CHAT_LAYOUT_STORAGE_KEY}.last`;

export interface IDroxPersistedChatTab {
	readonly sessionId: string;
	readonly title?: string;
	readonly titleFromModel?: boolean;
	readonly uiStats?: { readonly totalIn: number; readonly totalOut: number; readonly ctx: number };
}

export interface IDroxChatLayoutSnapshot {
	readonly version: number;
	readonly tabs: readonly IDroxPersistedChatTab[];
	readonly activeTabId: string | null;
}

interface IDroxChatLayoutMemento {
	snapshot?: IDroxChatLayoutSnapshot;
}

export class DroxChatLayoutStore {

	private readonly _windowMemento: Memento<IDroxChatLayoutMemento>;
	private readonly _lastMemento: Memento<IDroxChatLayoutMemento>;

	constructor(
		@IStorageService storageService: IStorageService,
		windowId: number = getWindowId(mainWindow),
	) {
		this._windowMemento = new Memento(droxChatLayoutMementoId(windowId), storageService);
		this._lastMemento = new Memento(DROX_CHAT_LAYOUT_LAST_MEMENTO_ID, storageService);
	}

	load(): IDroxChatLayoutSnapshot | undefined {
		return this._parse(this._windowMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE).snapshot)
			?? this._parse(this._lastMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE).snapshot);
	}

	save(snapshot: IDroxChatLayoutSnapshot): void {
		const windowStorage = this._windowMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		windowStorage.snapshot = snapshot;
		this._windowMemento.saveMemento();

		const lastStorage = this._lastMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		lastStorage.snapshot = snapshot;
		this._lastMemento.saveMemento();
	}

	clear(): void {
		const windowStorage = this._windowMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		delete windowStorage.snapshot;
		this._windowMemento.saveMemento();

		const lastStorage = this._lastMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		delete lastStorage.snapshot;
		this._lastMemento.saveMemento();
	}

	private _parse(raw: IDroxChatLayoutSnapshot | undefined): IDroxChatLayoutSnapshot | undefined {
		if (!raw || raw.version !== DROX_CHAT_LAYOUT_VERSION) {
			return undefined;
		}
		if (!Array.isArray(raw.tabs) || raw.tabs.length === 0) {
			return undefined;
		}
		const tabs = raw.tabs.filter(t => typeof t?.sessionId === 'string' && t.sessionId.startsWith('ses_'));
		if (tabs.length === 0) {
			return undefined;
		}
		const activeTabId =
			typeof raw.activeTabId === 'string' && raw.activeTabId.startsWith('ses_') ? raw.activeTabId : null;
		return { version: DROX_CHAT_LAYOUT_VERSION, tabs, activeTabId };
	}
}
