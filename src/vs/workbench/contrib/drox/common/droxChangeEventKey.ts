/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file



import { IDroxFileChangePayload } from './droxFileChange.js';

import { droxSessionChangePathKey } from './droxPathUtil.js';



/** Clé stable pour dismiss / persistance panneau Changes. */

export function droxChangeEventKey(change: IDroxFileChangePayload, fallbackIndex = 0): string {

	const toolId = String(change.toolId || '').trim();

	if (toolId) {

		return toolId;

	}

	return `${droxSessionChangePathKey(change.path)}#${fallbackIndex}`;

}


