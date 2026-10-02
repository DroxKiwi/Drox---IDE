/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extname } from '../../../../../base/common/path.js';

const SKIP_DIR_NAMES = new Set([
	'.git',
	'.drox',
	'node_modules',
	'out',
	'dist',
	'build',
	'.build',
	'coverage',
	'.next',
	'.turbo',
	'target',
	'__pycache__',
	'.venv',
	'venv',
]);

const SKIP_EXTENSIONS = new Set([
	'.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svg',
	'.woff', '.woff2', '.ttf', '.eot',
	'.mp3', '.mp4', '.wav', '.webm',
	'.zip', '.7z', '.rar', '.gz', '.tar',
	'.exe', '.dll', '.so', '.dylib', '.node',
	'.pdf', '.wasm', '.bin', '.lock',
	'.tsbuildinfo', '.map',
]);

/** Max file size to index in CB1 (bytes). */
export const DROX_CODEBASE_MAX_FILE_BYTES = 256 * 1024;

/** Soft cap on files scanned per ensureIndexed (CB1). */
export const DROX_CODEBASE_MAX_FILES = 2500;

export function droxCodebaseShouldSkipDirName(name: string): boolean {
	return SKIP_DIR_NAMES.has(name) || name.startsWith('.');
}

export function droxCodebaseShouldSkipFileName(name: string): boolean {
	const lower = name.toLowerCase();
	if (lower === '.env' || lower.startsWith('.env.')) {
		return true;
	}
	if (lower.includes('credentials') || lower.includes('secrets')) {
		return true;
	}
	// Build / tooling noise (CB4b — was polluting hybrid retrieval).
	if (lower.endsWith('.tsbuildinfo') || lower.endsWith('.js.map') || lower.endsWith('.css.map')) {
		return true;
	}
	const ext = extname(lower);
	return SKIP_EXTENSIONS.has(ext);
}
