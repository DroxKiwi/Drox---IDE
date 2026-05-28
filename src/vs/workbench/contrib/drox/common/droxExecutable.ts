/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from '../../../../base/common/path.js';

import { isWindows } from '../../../../base/common/platform.js';

import { URI } from '../../../../base/common/uri.js';

import { IFileService } from '../../../../platform/files/common/files.js';



const BIN = isWindows ? 'drox.exe' : 'drox';



export interface IDroxExecutableResolveOptions {

	readonly configuredPath: string;

	readonly workspaceFolderPaths: readonly string[];

	readonly appRoot?: string;

}



/**

 * Folder name under `resources/drox/` for the running host (e.g. `win32-x64`).

 * Aligns with VS Code extension target platforms.

 */

export function droxResourcePlatformFolder(): string | undefined {

	if (typeof process === 'undefined' || typeof process.platform !== 'string') {

		return undefined;

	}

	const arch = typeof process.arch === 'string' ? process.arch : 'x64';

	switch (process.platform) {

		case 'win32':

			return arch === 'arm64' ? 'win32-arm64' : 'win32-x64';

		case 'darwin':

			return arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';

		case 'linux':

			if (arch === 'arm64') {

				return 'linux-arm64';

			}

			if (arch === 'arm') {

				return 'linux-armhf';

			}

			return 'linux-x64';

		default:

			return undefined;

	}

}



/**

 * Resolves the `drox` binary used to run `drox --serve`.

 *

 * Order:

 *   1. `drox.executablePath` when set.

 *   2. Probes under each workspace folder (`drox-engine/drox/target/...`).

 *   3. Probes under `appRoot` (dev cargo + packaged `resources/drox/<platform>/`).

 *   4. Fallback: `drox` on PATH.

 */

export async function resolveDroxExecutablePath(

	fileService: IFileService,

	options: IDroxExecutableResolveOptions,

): Promise<string> {

	const trimmed = options.configuredPath.trim();

	if (trimmed.length > 0) {

		return trimmed;

	}



	const candidates: string[] = [];



	for (const root of options.workspaceFolderPaths) {

		candidates.push(

			path.join(root, 'drox-engine', 'drox', 'target', 'debug', BIN),

			path.join(root, 'drox-engine', 'drox', 'target', 'release', BIN),

			path.join(root, 'drox', 'target', 'debug', BIN),

			path.join(root, 'drox', 'target', 'release', BIN),

		);

	}



	if (options.appRoot) {

		const platformFolder = droxResourcePlatformFolder();

		if (platformFolder) {

			candidates.push(path.join(options.appRoot, 'resources', 'drox', platformFolder, BIN));

		}

		candidates.push(path.join(options.appRoot, 'resources', 'drox', BIN));

		candidates.push(

			path.join(options.appRoot, 'drox-engine', 'drox', 'target', 'debug', BIN),

			path.join(options.appRoot, 'drox-engine', 'drox', 'target', 'release', BIN),

		);

	}



	for (const candidate of candidates) {

		if (await fileService.exists(URI.file(candidate))) {

			return candidate;

		}

	}



	return 'drox';

}

