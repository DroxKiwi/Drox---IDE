/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import {
	createDroxActivityGridElement,
	DROX_RESPONSE_LOADING_GRID_CLASSES,
	mountDroxRunActivityGrid,
} from '../droxActivityGrid.js';

const AVATAR_GRID_CLASSES = DROX_RESPONSE_LOADING_GRID_CLASSES;

const DROX_AVATAR_RUN_ATTR = 'data-drox-avatar-run';
const PORTAL_CLASS = 'drox-avatar-run-portal';

/** Délai avant retrait grille (évite clignotement si `chat-response-loading` vacille au stream). */
const AVATAR_RUN_COMPLETE_DEBOUNCE_MS = 650;

const isAvatarRunActive = (item: HTMLElement): boolean => {
	if (item.classList.contains('chat-response-loading')) {
		return true;
	}
	if (item.querySelector('.chat-working-progress-active')) {
		return true;
	}
	if (
		item.classList.contains('chat-persistent-progress')
		&& item.querySelector('.chat-working-progress')
	) {
		return true;
	}
	return false;
};

/**
 * Avatar de réponse en chargement : grille 3×3 Drox à la place du logo VS Code.
 * La grille vit dans un portail absolu (hors du flux `.value`) pour ne pas bouger au stream.
 */
export function attachDroxWorkingProgressGrid(root: HTMLElement): IDisposable {
	const store = new DisposableStore();

	const responseGrids = new WeakMap<HTMLElement, HTMLDivElement>();
	const responsePortals = new WeakMap<HTMLElement, HTMLDivElement>();
	const spinnerGrids = new WeakMap<HTMLElement, HTMLDivElement>();
	const completeSchedulers = new WeakMap<HTMLElement, RunOnceScheduler>();

	const ensureAvatarGrid = (item: HTMLElement): HTMLDivElement => {
		let grid = responseGrids.get(item);
		if (!grid) {
			grid = createDroxActivityGridElement(AVATAR_GRID_CLASSES);
			responseGrids.set(item, grid);
		}
		return grid;
	};

	const ensurePortal = (item: HTMLElement): HTMLDivElement | undefined => {
		const header = item.querySelector<HTMLElement>('.header');
		if (!header || header.classList.contains('hidden')) {
			return undefined;
		}
		let portal = responsePortals.get(item);
		if (!portal || !portal.isConnected) {
			portal = header.querySelector<HTMLDivElement>(`:scope > .${PORTAL_CLASS}`) ?? undefined;
		}
		if (!portal) {
			portal = document.createElement('div');
			portal.className = PORTAL_CLASS;
			portal.setAttribute('aria-hidden', 'true');
			header.insertBefore(portal, header.firstChild);
		} else if (portal.parentElement !== header) {
			header.insertBefore(portal, header.firstChild);
		}
		responsePortals.set(item, portal);
		return portal;
	};

	const finishAvatarRun = (item: HTMLElement): void => {
		item.removeAttribute(DROX_AVATAR_RUN_ATTR);
		const grid = responseGrids.get(item);
		grid?.remove();
		responseGrids.delete(item);
		const portal = responsePortals.get(item);
		portal?.remove();
		responsePortals.delete(item);
		const scheduler = completeSchedulers.get(item);
		scheduler?.dispose();
		completeSchedulers.delete(item);
	};

	const syncResponseAvatar = (item: HTMLElement): void => {
		const runActive = isAvatarRunActive(item);

		if (runActive) {
			item.setAttribute(DROX_AVATAR_RUN_ATTR, '');
			completeSchedulers.get(item)?.cancel();
			const portal = ensurePortal(item);
			if (!portal) {
				return;
			}
			const mounted = ensureAvatarGrid(item);
			if (mounted.parentElement !== portal) {
				portal.appendChild(mounted);
			}
			return;
		}

		if (!item.hasAttribute(DROX_AVATAR_RUN_ATTR)) {
			return;
		}

		let scheduler = completeSchedulers.get(item);
		if (!scheduler) {
			scheduler = store.add(
				new RunOnceScheduler(() => finishAvatarRun(item), AVATAR_RUN_COMPLETE_DEBOUNCE_MS),
			);
			completeSchedulers.set(item, scheduler);
		}
		scheduler.schedule();
	};

	/** Lignes « working » thinking / outil : remplace l’icône MS par la grille Drox, une fois par ligne. */
	const syncThinkingSpinners = (): void => {
		for (const row of root.querySelectorAll<HTMLElement>('.chat-thinking-spinner-item')) {
			if (row.closest('.chat-working-progress')) {
				continue;
			}
			let grid = spinnerGrids.get(row);
			grid = mountDroxRunActivityGrid(row, grid);
			spinnerGrids.set(row, grid);
		}
	};

	const apply = (): void => {
		for (const row of root.querySelectorAll<HTMLElement>('.chat-working-progress > .activity-grid, .drox-footer-working-grid')) {
			row.remove();
		}
		for (const stray of root.querySelectorAll<HTMLElement>(
			'.avatar-container .drox-response-loading-grid',
		)) {
			if (stray.closest(`.${PORTAL_CLASS}`)) {
				continue;
			}
			stray.remove();
		}
		for (const item of root.querySelectorAll<HTMLElement>('.interactive-item-container.interactive-response')) {
			syncResponseAvatar(item);
		}
		syncThinkingSpinners();
	};

	const scheduleApply = store.add(new RunOnceScheduler(apply, 16));

	let observer: MutationObserver | undefined;
	const onMutation = (records: MutationRecord[]): void => {
		let needsSync = false;
		for (const record of records) {
			if (record.type === 'attributes' && record.attributeName === 'class') {
				const target = record.target;
				if (
					target instanceof HTMLElement
					&& (target.classList.contains('interactive-response')
						|| target.classList.contains('chat-thinking-spinner-item')
						|| target.classList.contains('chat-working-progress')
						)
				) {
					needsSync = true;
					break;
				}
			} else if (record.type === 'childList') {
				const target = record.target;
				if (
					target instanceof HTMLElement
					&& (target.classList.contains('chat-markdown-part')
						|| target.classList.contains('rendered-markdown')
						|| target.closest('.chat-markdown-part .rendered-markdown, .rendered-markdown'))
				) {
					continue;
				}
				needsSync = true;
				break;
			}
		}
		if (needsSync) {
			scheduleApply.schedule();
		}
	};

	observer = new MutationObserver(onMutation);
	observer.observe(root, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['class'],
	});
	store.add({ dispose: () => observer?.disconnect() });

	apply();
	return store;
}