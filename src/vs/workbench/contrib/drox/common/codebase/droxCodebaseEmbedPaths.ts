/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../../../base/common/path.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';

/** Default MiniLM GGUF filename — shipped with the app under resources/drox/models/. */
export const DROX_EMBED_DEFAULT_MODEL_ID = 'all-MiniLM-L6-v2.Q4_K_M.gguf';

/** Human label for the default model (cockpit / docs). */
export const DROX_EMBED_DEFAULT_MODEL_LABEL = 'all-MiniLM-L6-v2 (Q4_K_M)';

export type DroxEmbedModelSource =
	| 'custom'
	| 'env'
	| 'bundled'
	| 'userData'
	| 'repo'
	| 'missing';

export interface IDroxEmbedModelResolveResult {
	readonly path: string | undefined;
	readonly source: DroxEmbedModelSource;
	readonly defaultModelId: string;
}

export interface IDroxEmbedModelResolveOptions {
	readonly customPath?: string;
	readonly modelId?: string;
	/** From `INativeEnvironmentService.appRoot` (not on browser `IEnvironmentService`). */
	readonly appRoot?: string;
	/** From `INativeEnvironmentService.userDataPath`. */
	readonly userDataPath?: string;
}

/**
 * Resolve embed model path (transparent sources for cockpit):
 * 1. explicit custom path (settings / cockpit)
 * 2. DROX_EMBED_MODEL_PATH (dev override)
 * 3. {appRoot}/resources/drox/models/<id> — **shipped default**
 * 4. {userData}/drox/models/<id>
 * 5. repo drox-engine/models/<id> (dev)
 */
export async function resolveDroxEmbedModelPathDetailed(
	fileService: IFileService,
	opts?: IDroxEmbedModelResolveOptions,
): Promise<IDroxEmbedModelResolveResult> {
	const modelId = opts?.modelId ?? DROX_EMBED_DEFAULT_MODEL_ID;

	const custom = opts?.customPath?.trim();
	if (custom && await fileService.exists(URI.file(custom))) {
		return { path: custom, source: 'custom', defaultModelId: modelId };
	}

	const envPath = (typeof process !== 'undefined' ? process.env['DROX_EMBED_MODEL_PATH'] : undefined)?.trim();
	if (envPath && await fileService.exists(URI.file(envPath))) {
		return { path: envPath, source: 'env', defaultModelId: modelId };
	}

	const appRoot = opts?.appRoot?.trim();
	if (appRoot) {
		const bundled = join(appRoot, 'resources', 'drox', 'models', modelId);
		if (await fileService.exists(URI.file(bundled))) {
			return { path: bundled, source: 'bundled', defaultModelId: modelId };
		}
	}

	const userDataRoot = opts?.userDataPath?.trim();
	if (userDataRoot) {
		const userData = join(userDataRoot, 'drox', 'models', modelId);
		if (await fileService.exists(URI.file(userData))) {
			return { path: userData, source: 'userData', defaultModelId: modelId };
		}
	}

	if (appRoot) {
		const fromAppRoot = await walkForRepoModel(fileService, appRoot, modelId);
		if (fromAppRoot) {
			return { path: fromAppRoot, source: 'repo', defaultModelId: modelId };
		}
	}

	if (typeof process !== 'undefined' && process.cwd) {
		const fromCwd = await walkForRepoModel(fileService, process.cwd(), modelId);
		if (fromCwd) {
			return { path: fromCwd, source: 'repo', defaultModelId: modelId };
		}
	}

	return { path: undefined, source: 'missing', defaultModelId: modelId };
}

export async function resolveDroxEmbedModelPath(
	fileService: IFileService,
	opts?: IDroxEmbedModelResolveOptions,
): Promise<string | undefined> {
	const resolved = await resolveDroxEmbedModelPathDetailed(fileService, opts);
	return resolved.path;
}

export function droxEmbedBundledModelPath(appRoot: string, modelId: string = DROX_EMBED_DEFAULT_MODEL_ID): string {
	return join(appRoot, 'resources', 'drox', 'models', modelId);
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
