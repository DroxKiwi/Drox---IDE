/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { createDroxActivityGridElement } from '../droxActivityGrid.js';

/**
 * Avatar de réponse en chargement : grille 3×3 Drox à la place du logo VS Code.
 * Les phrases (`chat.thinking.phrases`) sur `.chat-working-progress` restent texte seul —
 * pas de second carré à côté de la phrase outil / fun copy.
 */
export function attachDroxWorkingProgressGrid(root: HTMLElement): IDisposable {
	const store = new DisposableStore();

	const ensureResponseAvatarGrid = (item: HTMLElement): void => {
		if (!item.classList.contains('chat-response-loading')) {
			return;
		}
		const avatar = item.querySelector<HTMLElement>('.avatar-container');
		if (!avatar || avatar.querySelector(':scope > .drox-response-loading-grid')) {
			return;
		}
		avatar.appendChild(createDroxActivityGridElement('activity-grid activity-grid-inline drox-response-loading-grid'));
	};

	let observer: MutationObserver | undefined;
	const apply = (): void => {
		observer?.disconnect();
		try {
			for (const row of root.querySelectorAll<HTMLElement>('.chat-working-progress > .activity-grid')) {
				row.remove();
			}
			for (const item of root.querySelectorAll<HTMLElement>('.interactive-item-container.interactive-response')) {
				ensureResponseAvatarGrid(item);
			}
		} finally {
			if (observer) {
				observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
			}
		}
	};

	const scheduleApply = store.add(new RunOnceScheduler(apply, 0));

	observer = new MutationObserver(() => scheduleApply.schedule());
	observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
	store.add({ dispose: () => observer?.disconnect() });

	apply();
	return store;
}