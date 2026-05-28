/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { basename, dirname, join, relative, resolve, sep } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { FileType, IFileService } from '../../../../platform/files/common/files.js';

export interface IDroxPathCompletionItem {
	/** Libellé dans la liste (ex. `src/`). */
	readonly label: string;
	/** Texte inséré après `@` (chemin relatif au workspace). */
	readonly insertText: string;
	readonly kind: 'file' | 'directory';
	readonly description?: string;
}

const MAX_RESULTS = 12;

/** Dossiers volumineux masqués sauf si l'utilisateur tape déjà le préfixe. */
const HEAVY_DIRS = new Set(['node_modules', '.git', 'target', 'dist', 'build']);

function isInsideWorkspace(workspaceRoot: string, dirPath: string): boolean {
	const ws = resolve(workspaceRoot);
	const dir = resolve(dirPath);
	return dir === ws || dir.startsWith(ws + sep);
}

/**
 * Découpe un token `@…` partiel en répertoire à lister + préfixe de filtre.
 */
export function parsePartialPath(
	partial: string,
	workspaceRoot: string,
): { directory: string; prefix: string } {
	let raw = partial.trim();
	if (raw.startsWith('@')) {
		raw = raw.slice(1);
	}
	if (raw.startsWith('./')) {
		raw = raw.slice(2);
	}
	if (!raw) {
		return { directory: workspaceRoot, prefix: '' };
	}
	const normalized = raw.replaceAll('\\', '/');
	if (normalized.endsWith('/')) {
		const dir = resolve(workspaceRoot, normalized);
		return { directory: dir, prefix: '' };
	}
	const dirPart = dirname(normalized);
	const base = basename(normalized);
	if (dirPart === '.' || dirPart === '') {
		return { directory: workspaceRoot, prefix: base };
	}
	const directory = resolve(workspaceRoot, dirPart);
	return { directory, prefix: base };
}

/**
 * Liste fichiers et dossiers sous `workspaceRoot` pour compléter un token `@`.
 */
export async function completeWorkspacePaths(
	fileService: IFileService,
	workspaceRoot: string,
	partial: string,
): Promise<IDroxPathCompletionItem[]> {
	const { directory, prefix } = parsePartialPath(partial, workspaceRoot);
	if (!isInsideWorkspace(workspaceRoot, directory)) {
		return [];
	}

	let entries: [string, FileType][];
	try {
		const stat = await fileService.resolve(URI.file(directory));
		if (!stat.isDirectory || !stat.children) {
			return [];
		}
		entries = stat.children.map(child => [child.name, child.isDirectory ? FileType.Directory : FileType.File]);
	} catch {
		return [];
	}

	const prefixLower = prefix.toLowerCase();
	const items: IDroxPathCompletionItem[] = [];

	for (const [name, fileType] of entries) {
		if (name.startsWith('.') && !prefix.startsWith('.')) {
			continue;
		}
		if (HEAVY_DIRS.has(name) && !prefixLower) {
			continue;
		}
		if (prefix && !name.toLowerCase().startsWith(prefixLower)) {
			continue;
		}

		const isDir = (fileType & FileType.Directory) === FileType.Directory;
		const abs = join(directory, name);
		let rel = relative(workspaceRoot, abs).replaceAll('\\', '/');
		if (!rel.startsWith('./') && rel !== '..') {
			rel = rel.startsWith('..') ? rel : `./${rel}`;
		}

		items.push({
			label: isDir ? `${name}/` : name,
			insertText: isDir ? `${rel}/` : rel,
			kind: isDir ? 'directory' : 'file',
			description: isDir ? 'folder' : 'file',
		});
	}

	items.sort((a, b) => {
		if (a.kind === 'directory' && b.kind !== 'directory') {
			return -1;
		}
		if (a.kind !== 'directory' && b.kind === 'directory') {
			return 1;
		}
		return a.label.localeCompare(b.label);
	});

	return items.slice(0, MAX_RESULTS);
}
