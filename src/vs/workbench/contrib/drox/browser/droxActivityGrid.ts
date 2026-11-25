/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

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

export function appendDroxActivityGrid(
	parent: HTMLElement,
	classNames = 'activity-grid activity-grid-inline',
): HTMLElement {
	const grid = createDroxActivityGridElement(classNames);
	parent.appendChild(grid);
	return grid;
}
