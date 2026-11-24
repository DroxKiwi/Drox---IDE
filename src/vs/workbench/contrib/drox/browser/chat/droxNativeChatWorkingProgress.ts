/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { createDroxActivityGridElement } from '../droxActivityGrid.js';

/**
 * Remplace le logo animé VS Code du pied de réponse par la grille 3×3 Drox.
 * Le texte reste celui des phrases Drox (`chat.thinking.phrases`).
 * Aucun noeud upstream n'est retiré : le logo est masqué en CSS.
 */
export function attachDroxWorkingProgressGrid(root: HTMLElement): IDisposable {
	const store = new DisposableStore();
	const syncRunAvatar = (item: HTMLElement): void => {
		const avatar = item.querySelector<HTMLElement>('.avatar-container');
		if (!avatar) {
			return;
		}
		const loading = item.classList.contains('chat-response-loading');
		let grid = avatar.querySelector<HTMLElement>(':scope > .drox-response-loading-grid');
		if (loading) {
			if (!grid) {
				grid = createDroxActivityGridElement('activity-grid activity-grid-inline drox-response-loading-grid');
				avatar.appendChild(grid);
			}
			for (const child of avatar.children) {
				if (child !== grid) {
					child.classList.add('drox-avatar-held');
				}
			}
			return;
		}
		grid?.remove();
		for (const child of avatar.children) {
			child.classList.remove('drox-avatar-held');
		}
	};
	const apply = (): void => {
		for (const row of root.querySelectorAll<HTMLElement>('.chat-working-progress')) {
			if (row.querySelector(':scope > .activity-grid')) {
				continue;
			}
			row.prepend(createDroxActivityGridElement('activity-grid activity-grid-inline'));
		}
		for (const item of root.querySelectorAll<HTMLElement>('.interactive-item-container.interactive-response')) {
			syncRunAvatar(item);
		}
	};
	const observer = new MutationObserver(apply);
	observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
	store.add({ dispose: () => observer.disconnect() });
	apply();
	return store;
}
