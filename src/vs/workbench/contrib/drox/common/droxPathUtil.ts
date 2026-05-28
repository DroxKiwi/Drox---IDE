/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../base/common/uri.js';



/**
 * Normalise un chemin filesystem Windows après `fs.realpath` / `URI#fsPath`.
 * Node renvoie parfois `\\?\C:\...` ; VS Code peut le réduire en `?\C:\...` (ENOENT).
 */
export function normalizeWindowsFsPath(raw: string): string {
	let p = raw.trim();
	if (!p) {
		return p;
	}
	if (p.startsWith('\\\\?\\UNC\\')) {
		p = '\\\\' + p.slice('\\\\?\\UNC\\'.length);
	} else if (p.startsWith('\\\\?\\')) {
		p = p.slice(4);
	}
	// Préfixe corrompu quand `resource.with({ path: realpath })` mélange URI et chemin Win32.
	if (p.startsWith('?\\') && /^[a-zA-Z]:/.test(p.slice(2))) {
		p = p.slice(2);
	} else if (p.startsWith('?') && /^[a-zA-Z]:/.test(p.slice(1))) {
		p = p.slice(1);
	}
	return p;
}



/** Normalise un chemin avant ouverture editeur (rejette URI corrompues). */
export function sanitizePathForEditor(raw: string): string | null {

	let p = raw.trim();

	if (!p) {

		return null;

	}

	if (p.startsWith('file://') || p.includes('://')) {

		try {

			p = URI.parse(p).fsPath;

		} catch {

			return null;

		}

	}

	p = normalizeWindowsFsPath(p);

	if (p.includes('\0') || /%3[fF]/.test(p)) {

		return null;

	}

	return p;

}
