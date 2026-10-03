/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxCodebaseAlert } from '../droxCodebaseTypes.js';

/** Root / index alerts for the Codebase cockpit (not embed-*). */
export function buildDroxCodebaseRootAlerts(opts: {
	readonly hasRoot: boolean;
	readonly manifest: { readonly files: number } | undefined;
}): readonly IDroxCodebaseAlert[] {
	if (!opts.hasRoot) {
		return [{
			id: 'no-root',
			severity: 'info',
			code: 'NO_WORKSPACE_ROOT',
			message: 'Open a folder to enable the codebase index.',
			at: Date.now(),
		}];
	}
	if (!opts.manifest) {
		return [{
			id: 'no-index',
			severity: 'info',
			code: 'NO_INDEX',
			message: 'No index yet for this folder — auto-index runs on open, or click Reindex.',
			at: Date.now(),
		}];
	}
	if (opts.manifest.files === 0) {
		return [{
			id: 'empty-workspace',
			severity: 'warn',
			code: 'EMPTY_WORKSPACE',
			message: 'No indexable source files in this folder. Default ignores (.git, .drox, node_modules, …) are skipped — add source files or open the correct project root.',
			at: Date.now(),
		}];
	}
	return [];
}
