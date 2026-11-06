/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Path of the map inside the open folder.
 * `''` is the folder itself. `undefined` is a path that leaves the folder.
 */
export function normalizeDroxSdtcmMapRoot(raw: string): string | undefined {
	const trimmed = raw.trim();
	if (!trimmed || trimmed === '.' || trimmed === './') {
		return '';
	}
	if (trimmed.includes(':') || trimmed.startsWith('\\\\') || trimmed.startsWith('//')) {
		return undefined;
	}
	let path = trimmed.replace(/\\/g, '/');
	while (path.startsWith('./')) {
		path = path.slice(2);
	}
	while (path.startsWith('/')) {
		path = path.slice(1);
	}
	while (path.endsWith('/')) {
		path = path.slice(0, -1);
	}
	if (!path) {
		return '';
	}
	const parts = path.split('/');
	if (parts.some(part => !part || part === '.' || part === '..')) {
		return undefined;
	}
	return parts.join('/');
}
