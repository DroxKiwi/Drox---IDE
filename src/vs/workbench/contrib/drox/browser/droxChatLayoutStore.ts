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

/** Clé memento : layout par fenêtre (évite de reprendre le chat d'une autre fenêtre sur le même workspace). */
export function droxChatLayoutMementoId(windowId: number): string {
	return `${DROX_CHAT_LAYOUT_STORAGE_KEY}.w${windowId}`;
}

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

	private readonly _memento: Memento<IDroxChatLayoutMemento>;

	constructor(
		@IStorageService storageService: IStorageService,
		windowId: number = getWindowId(mainWindow),
	) {
		this._memento = new Memento(droxChatLayoutMementoId(windowId), storageService);
	}

	load(): IDroxChatLayoutSnapshot | undefined {
		const raw = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE).snapshot;
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

	save(snapshot: IDroxChatLayoutSnapshot): void {
		const storage = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage.snapshot = snapshot;
		this._memento.saveMemento();
	}

	clear(): void {
		const storage = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		delete storage.snapshot;
		this._memento.saveMemento();
	}
}
