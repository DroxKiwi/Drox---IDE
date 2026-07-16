/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';

/** Bulles skeleton pour le fil chat pendant le chargement d'une session. */
export function createDroxChatSessionSkeletonElement(): HTMLElement {
	const root = dom.$('.drox-loading-skeleton');
	for (const align of ['user', 'assistant', 'user'] as const) {
		const row = dom.append(root, dom.$(`.drox-skeleton-row.drox-skeleton-row-${align}`));
		dom.append(row, dom.$('.drox-skeleton-bubble'));
	}
	return root;
}
