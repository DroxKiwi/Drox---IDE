/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';

/** Default MiniLM GGUF filename (CB2). */
export const DROX_EMBED_DEFAULT_MODEL_ID = 'all-MiniLM-L6-v2.Q4_K_M.gguf';

/**
 * Resolve embed model path (dev = ship):
 * 1. DROX_EMBED_MODEL_PATH
 * 2. {userData}/drox/models/<id>
 * 3. {appRoot}/resources/drox/models/<id> (ship)
 * 4. repo drox-engine/models/<id> (dev heuristic via cwd walk — optional)
 */
export async function resolveDroxEmbedModelPath(
	fileService: IFileService,
	environmentService: IEnvironmentService,
	modelId: string = DROX_EMBED_DEFAULT_MODEL_ID,
): Promise<string | undefined> {
	const envPath = (typeof process !== 'undefined' ? process.env['DROX_EMBED_MODEL_PATH'] : undefined)?.trim();
	if (envPath && await fileService.exists(URI.file(envPath))) {
		return envPath;
	}

	const userData = join(environmentService.userDataPath, 'drox', 'models', modelId);
	if (await fileService.exists(URI.file(userData))) {
		return userData;
	}

	const appRoot = environmentService.appRoot;
	if (appRoot) {
		const bundled = join(appRoot, 'resources', 'drox', 'models', modelId);
		if (await fileService.exists(URI.file(bundled))) {
			return bundled;
		}
		const fromAppRoot = await walkForRepoModel(fileService, appRoot, modelId);
		if (fromAppRoot) {
			return fromAppRoot;
		}
	}

	if (typeof process !== 'undefined' && process.cwd) {
		const fromCwd = await walkForRepoModel(fileService, process.cwd(), modelId);
		if (fromCwd) {
			return fromCwd;
		}
	}

	return undefined;
}

async function walkForRepoModel(
	fileService: IFileService,
	startDir: string,
	modelId: string,
): Promise<string | undefined> {
	let dir = startDir;
	for (let i = 0; i < 8; i++) {
		const candidate = join(dir, 'drox-engine', 'models', modelId);
		if (await fileService.exists(URI.file(candidate))) {
			return candidate;
		}
		const parent = join(dir, '..');
		if (parent === dir) {
			break;
		}
		dir = parent;
	}
	return undefined;
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
	const n = Math.min(a.length, b.length);
	if (n === 0) {
		return 0;
	}
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < n; i++) {
		dot += a[i]! * b[i]!;
		na += a[i]! * a[i]!;
		nb += b[i]! * b[i]!;
	}
	const denom = Math.sqrt(na) * Math.sqrt(nb);
	return denom === 0 ? 0 : dot / denom;
}
