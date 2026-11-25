/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Classes grille run (avatar, lignes thinking) — animation continue tant que le nœud reste monté. */
export const DROX_RUN_ACTIVITY_GRID_CLASSES =
	'activity-grid activity-grid-inline drox-run-activity-grid activity-grid-persistent';

/** Même grille / keyframes que l’avatar agent principal (`droxNativeChatWorkingProgress`). */
export const DROX_RESPONSE_LOADING_GRID_CLASSES =
	`${DROX_RUN_ACTIVITY_GRID_CLASSES} drox-response-loading-grid`;

/** Grille 3×3 pulsée — même animation que Drox Chat (`activity.js` / `droxChatMvp.css`). */
export function createDroxActivityGridElement(
	classNames = 'activity-grid activity-grid-inline',
): HTMLDivElement {
	const grid = document.createElement('div');
	grid.className = classNames;
	grid.setAttribute('aria-hidden', 'true');
	for (let i = 0; i < 9; i++) {
		grid.appendChild(document.createElement('span'));
	}
	return grid;
}

/**
 * Monte une grille existante ou en crée une — réutilise le même élément DOM pour ne pas
 * relancer les keyframes CSS.
 */
export function mountDroxRunActivityGrid(
	parent: HTMLElement,
	existing?: HTMLDivElement,
): HTMLDivElement {
	const grid = existing ?? createDroxActivityGridElement(DROX_RUN_ACTIVITY_GRID_CLASSES);
	if (grid.parentElement !== parent) {
		parent.insertBefore(grid, parent.firstChild);
	}
	return grid;
}

export function appendDroxActivityGrid(
	parent: HTMLElement,
	classNames = 'activity-grid activity-grid-inline',
): HTMLElement {
	const grid = createDroxActivityGridElement(classNames);
	parent.appendChild(grid);
	return grid;
}
