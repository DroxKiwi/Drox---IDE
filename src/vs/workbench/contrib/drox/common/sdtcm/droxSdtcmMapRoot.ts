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

export interface IDroxSdtcmFolderCount {
	readonly path: string;
	readonly files: number;
}

/** Source-file counts under each folder, from a file list already walked. `''` is the whole folder. */
export function tallyDroxSdtcmFolders(files: readonly string[]): IDroxSdtcmFolderCount[] {
	const counts = new Map<string, number>();
	counts.set('', 0);
	for (const file of files) {
		counts.set('', (counts.get('') ?? 0) + 1);
		let dir = file;
		const slash = dir.lastIndexOf('/');
		dir = slash === -1 ? '' : dir.slice(0, slash);
		while (dir) {
			counts.set(dir, (counts.get(dir) ?? 0) + 1);
			const cut = dir.lastIndexOf('/');
			dir = cut === -1 ? '' : dir.slice(0, cut);
		}
	}
	return [...counts.entries()]
		.map(([path, total]) => ({ path, files: total }))
		.sort((a, b) => {
			if (a.path === b.path) {
				return 0;
			}
			if (!a.path) {
				return -1;
			}
			if (!b.path) {
				return 1;
			}
			return a.path < b.path ? -1 : 1;
		});
}

/** A file or folder path lies under one chosen root. An empty list keeps the whole folder. */
export function droxSdtcmPathInMapRoot(path: string, mapRoot: string | readonly string[]): boolean {
	const roots = (typeof mapRoot === 'string' ? [mapRoot] : mapRoot).filter(root => root.length > 0);
	if (!roots.length) {
		return true;
	}
	return roots.some(root => path === root || path.startsWith(`${root}/`));
}
