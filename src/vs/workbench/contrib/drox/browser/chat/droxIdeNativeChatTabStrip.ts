/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IDroxIdeNativeChatTab } from './droxIdeNativeChatTabs.js';

export interface IDroxIdeNativeChatTabStripCallbacks {
	readonly onSelect: (sessionId: string) => void;
	readonly onClose: (sessionId: string) => void;
}

/** Bandeau d’onglets du panneau chat natif IDE. */
export class DroxIdeNativeChatTabStrip extends Disposable {

	private readonly _root: HTMLElement;
	private readonly _list: HTMLElement;
	private readonly _tabListeners = this._register(new DisposableStore());

	constructor(
		container: HTMLElement,
		private readonly _callbacks: IDroxIdeNativeChatTabStripCallbacks,
	) {
		super();
		this._root = dom.append(container, dom.$('.drox-ide-native-chat-tabs'));
		this._list = dom.append(this._root, dom.$('.drox-ide-native-chat-tabs-list'));
	}

	get height(): number {
		return this._root.offsetHeight;
	}

	render(tabs: readonly IDroxIdeNativeChatTab[], activeSessionId: string | undefined): void {
		this._tabListeners.clear();
		dom.clearNode(this._list);
		for (const tab of tabs) {
			const item = dom.append(this._list, dom.$('.drox-ide-native-chat-tab'));
			const selected = tab.sessionId === activeSessionId;
			if (selected) {
				item.classList.add('active');
			}
			item.setAttribute('role', 'tab');
			item.setAttribute('aria-selected', selected ? 'true' : 'false');

			const label = dom.append(item, dom.$('button.drox-ide-native-chat-tab-label')) as HTMLButtonElement;
			label.type = 'button';
			label.textContent = tab.title;
			label.title = tab.title;
			this._tabListeners.add(dom.addDisposableListener(label, 'click', () => this._callbacks.onSelect(tab.sessionId)));

			const close = dom.append(item, dom.$('button.drox-ide-native-chat-tab-close')) as HTMLButtonElement;
			close.type = 'button';
			close.textContent = '×';
			close.title = localize('drox.ideNativeChat.tab.close', 'Close chat');
			close.setAttribute('aria-label', close.title);
			this._tabListeners.add(dom.addDisposableListener(close, 'click', event => {
				event.preventDefault();
				event.stopPropagation();
				this._callbacks.onClose(tab.sessionId);
			}));
		}
	}
}
