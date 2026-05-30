/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync } from 'fs';
import { dirname } from '../../../../base/common/path.js';
import {
	enumerateDroxExecutableCandidates,
	IDroxExecutableResolveOptions,
	isBareDroxExecutableName,
} from '../common/droxExecutable.js';

const BARE_DROX = 'drox';

/**
 * Resolves the bundled `drox` binary on disk (main process — `fs.existsSync`).
 * Used when the renderer passed a bare `drox` / missing path before spawn.
 */
export function resolveDroxExecutableOnDisk(
	options: IDroxExecutableResolveOptions,
): string | undefined {
	const trimmed = options.configuredPath.trim();
	if (trimmed.length > 0 && !isBareDroxExecutableName(trimmed) && existsSync(trimmed)) {
		return trimmed;
	}

	for (const candidate of enumerateDroxExecutableCandidates(options)) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

/** Install root: folder containing `Drox IDE.exe` in packaged builds. */
export function defaultDroxInstallDir(): string {
	return dirname(process.execPath);
}

export function isUnresolvedBareDroxExecutable(executable: string): boolean {
	const t = executable.trim();
	return t.length === 0 || t === BARE_DROX || isBareDroxExecutableName(t);
}
