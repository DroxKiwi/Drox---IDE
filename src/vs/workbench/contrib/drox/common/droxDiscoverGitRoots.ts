/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { droxSessionChangePathKey } from './droxPathUtil.js';

/** Max descent under a non-git parent when scanning for nested repos. */
export const DROX_DISCOVER_GIT_ROOTS_MAX_DEPTH = 3;

const IGNORED_DIR_NAMES = new Set([
	'node_modules',
	'.git',
	'.drox',
	'dist',
	'out',
	'build',
	'.next',
	'.turbo',
	'coverage',
	'__pycache__',
	'.venv',
	'venv',
	'target',
]);

export function isIgnoredGitScanDirectoryName(name: string): boolean {
	return IGNORED_DIR_NAMES.has(name.toLowerCase());
}

/**
 * Discover git working-tree roots under `parentFsPath`.
 *
 * - If `parent` itself is a git repo → `[parent]`.
 * - Otherwise → child / descendant dirs (depth-bounded) that contain `.git`.
 */
export async function discoverGitRoots(
	fileService: IFileService,
	parentFsPath: string,
	options?: { readonly maxDepth?: number },
): Promise<URI[]> {
	const parent = URI.file(parentFsPath);
	const maxDepth = options?.maxDepth ?? DROX_DISCOVER_GIT_ROOTS_MAX_DEPTH;

	if (await hasGitMarker(fileService, parent)) {
		return [parent];
	}

	const roots: URI[] = [];
	await walk(fileService, parent, 0, maxDepth, roots);

	roots.sort((a, b) => droxSessionChangePathKey(a.fsPath).localeCompare(droxSessionChangePathKey(b.fsPath)));
	return roots;
}

async function hasGitMarker(fileService: IFileService, folder: URI): Promise<boolean> {
	const gitUri = URI.joinPath(folder, '.git');
	try {
		return await fileService.exists(gitUri);
	} catch {
		return false;
	}
}

async function walk(
	fileService: IFileService,
	folder: URI,
	depth: number,
	maxDepth: number,
	out: URI[],
): Promise<void> {
	if (depth >= maxDepth) {
		return;
	}

	let children;
	try {
		const stat = await fileService.resolve(folder);
		children = stat.children;
	} catch {
		return;
	}
	if (!children) {
		return;
	}

	for (const child of children) {
		if (!child.isDirectory) {
			continue;
		}
		if (isIgnoredGitScanDirectoryName(child.name)) {
			continue;
		}
		if (await hasGitMarker(fileService, child.resource)) {
			out.push(child.resource);
			continue; // do not descend into nested repo
		}
		await walk(fileService, child.resource, depth + 1, maxDepth, out);
	}
}

/** Pick the deepest git root that contains `fileFsPath`, or undefined. */
export function matchGitRootForPath(
	gitRoots: readonly URI[],
	fileFsPath: string,
): URI | undefined {
	const fileKey = droxSessionChangePathKey(fileFsPath);
	let best: URI | undefined;
	let bestLen = -1;
	for (const root of gitRoots) {
		const rootKey = droxSessionChangePathKey(root.fsPath);
		if (fileKey === rootKey || fileKey.startsWith(rootKey.endsWith('/') ? rootKey : `${rootKey}/`)) {
			if (rootKey.length > bestLen) {
				best = root;
				bestLen = rootKey.length;
			}
		}
	}
	return best;
}
