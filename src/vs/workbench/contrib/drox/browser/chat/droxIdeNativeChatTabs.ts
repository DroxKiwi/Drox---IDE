/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../../nls.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { Memento } from '../../../../common/memento.js';
import { isListableDroxSessionId } from '../../common/droxSession.js';

/** Onglets du chat natif IDE uniquement — pas le layout webview / Agents. */
export const DROX_IDE_NATIVE_CHAT_TABS_MEMENTO = 'drox.ideNativeChat.tabs';

export const DROX_IDE_NATIVE_CHAT_TAB_LIMIT = 10;

export interface IDroxIdeNativeChatTab {
	readonly sessionId: string;
	readonly title: string;
}

export interface IDroxIdeNativeChatTabsSnapshot {
	readonly tabs: readonly IDroxIdeNativeChatTab[];
	readonly activeSessionId: string | undefined;
}

interface IDroxIdeNativeChatTabsMemento {
	snapshot?: {
		tabs?: readonly { sessionId?: string; title?: string }[];
		activeSessionId?: string | null;
	};
}

export function defaultIdeNativeChatTabTitle(): string {
	return localize('drox.ideNativeChat.tab.new', 'New chat');
}

export function ensureIdeNativeChatTab(
	tabs: readonly IDroxIdeNativeChatTab[],
	sessionId: string,
	title: string,
	limit: number = DROX_IDE_NATIVE_CHAT_TAB_LIMIT,
): { readonly tabs: readonly IDroxIdeNativeChatTab[]; readonly rejected: boolean } {
	if (!isListableDroxSessionId(sessionId)) {
		return { tabs, rejected: true };
	}
	if (tabs.some(tab => tab.sessionId === sessionId)) {
		return { tabs, rejected: false };
	}
	if (tabs.length >= limit) {
		return { tabs, rejected: true };
	}
	const label = title.trim() || defaultIdeNativeChatTabTitle();
	return { tabs: [...tabs, { sessionId, title: label }], rejected: false };
}

export function closeIdeNativeChatTab(
	tabs: readonly IDroxIdeNativeChatTab[],
	sessionId: string,
): { readonly tabs: readonly IDroxIdeNativeChatTab[]; readonly nextSessionId: string | undefined } {
	const index = tabs.findIndex(tab => tab.sessionId === sessionId);
	if (index < 0) {
		return { tabs, nextSessionId: undefined };
	}
	const nextTabs = tabs.filter(tab => tab.sessionId !== sessionId);
	const neighbor = nextTabs[index] ?? nextTabs[index - 1];
	return { tabs: nextTabs, nextSessionId: neighbor?.sessionId };
}

export function applyIdeNativeChatTabTitles(
	tabs: readonly IDroxIdeNativeChatTab[],
	titlesBySession: ReadonlyMap<string, string>,
): readonly IDroxIdeNativeChatTab[] {
	return tabs.map(tab => {
		const next = titlesBySession.get(tab.sessionId)?.trim();
		if (!next || next === tab.title) {
			return tab;
		}
		return { sessionId: tab.sessionId, title: next };
	});
}

export class DroxIdeNativeChatTabsStore {

	private readonly _memento: Memento<IDroxIdeNativeChatTabsMemento>;

	constructor(
		@IStorageService storageService: IStorageService,
	) {
		this._memento = new Memento(DROX_IDE_NATIVE_CHAT_TABS_MEMENTO, storageService);
	}

	load(): IDroxIdeNativeChatTabsSnapshot {
		const raw = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE).snapshot;
		const tabs: IDroxIdeNativeChatTab[] = [];
		for (const entry of raw?.tabs ?? []) {
			const sessionId = entry.sessionId?.trim() ?? '';
			if (!isListableDroxSessionId(sessionId) || tabs.some(tab => tab.sessionId === sessionId)) {
				continue;
			}
			if (tabs.length >= DROX_IDE_NATIVE_CHAT_TAB_LIMIT) {
				break;
			}
			tabs.push({
				sessionId,
				title: entry.title?.trim() || defaultIdeNativeChatTabTitle(),
			});
		}
		const active = raw?.activeSessionId?.trim();
		const activeSessionId = active && tabs.some(tab => tab.sessionId === active) ? active : tabs[0]?.sessionId;
		return { tabs, activeSessionId };
	}

	save(tabs: readonly IDroxIdeNativeChatTab[], activeSessionId: string | undefined): void {
		const storage = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		storage.snapshot = {
			tabs: tabs.map(tab => ({ sessionId: tab.sessionId, title: tab.title })),
			activeSessionId: activeSessionId ?? null,
		};
		this._memento.saveMemento();
	}

	clear(): void {
		const storage = this._memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
		delete storage.snapshot;
		this._memento.saveMemento();
	}
}
