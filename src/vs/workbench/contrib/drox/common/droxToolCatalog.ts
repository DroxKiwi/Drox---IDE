/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Outils non désactivables côté moteur. */

export const DROX_ALWAYS_ACTIVE_TOOLS = ['ask_user_question', 'todo_write'] as const;



import { DROX_TOGGLEABLE_TOOL_NAMES } from './droxToolGroups.js';

export { DROX_TOGGLEABLE_TOOL_NAMES };



const ALWAYS_ACTIVE = new Set<string>(DROX_ALWAYS_ACTIVE_TOOLS);



export function isAlwaysActiveTool(name: string): boolean {

	return ALWAYS_ACTIVE.has(name);

}



export function getDisabledToolNames(disabled: readonly string[]): Set<string> {

	const out = new Set<string>();

	for (const name of disabled) {

		if (typeof name !== 'string' || !name.trim()) {

			continue;

		}

		const n = name.trim();

		if (isAlwaysActiveTool(n)) {

			continue;

		}

		if (DROX_TOGGLEABLE_TOOL_NAMES.includes(n)) {

			out.add(n);

		}

	}

	return out;

}


