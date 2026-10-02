/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { match as globMatch } from '../../../../../base/common/glob.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { droxCodebaseExclusionsPath, droxCodebaseIndexDir } from './droxCodebasePaths.js';

export const DROX_CODEBASE_EXCLUSIONS_SCHEMA = 1;

export interface IDroxCodebaseExclusions {
	readonly schema: number;
	readonly globs: readonly string[];
}

function normalizeRel(path: string): string {
	return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * True when relative posix path matches any exclusion glob
 * (exact path, folder prefix, or vscode-style glob).
 */
export function droxCodebasePathMatchesExclusion(relPosix: string, globs: readonly string[]): boolean {
	const path = normalizeRel(relPosix);
	if (!path || !globs.length) {
		return false;
	}
	for (const raw of globs) {
		const g = normalizeRel(raw);
		if (!g) {
			continue;
		}
		if (path === g || path.startsWith(g.endsWith('/') ? g : `${g}/`)) {
			return true;
		}
		if (globMatch(g, path)) {
			return true;
		}
	}
	return false;
}

export function droxCodebaseMergeExclusionGlobs(
	existing: readonly string[],
	toAdd: readonly string[],
): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const raw of [...existing, ...toAdd]) {
		const g = normalizeRel(raw);
		if (!g || seen.has(g)) {
			continue;
		}
		seen.add(g);
		out.push(g);
	}
	return out.sort((a, b) => a.localeCompare(b));
}

export async function droxCodebaseReadExclusions(
	fileService: IFileService,
	workspaceRootFsPath: string,
): Promise<IDroxCodebaseExclusions> {
	const uri = URI.file(droxCodebaseExclusionsPath(workspaceRootFsPath));
	if (!(await fileService.exists(uri))) {
		return { schema: DROX_CODEBASE_EXCLUSIONS_SCHEMA, globs: [] };
	}
	try {
		const raw = (await fileService.readFile(uri)).value.toString();
		const parsed = JSON.parse(raw) as IDroxCodebaseExclusions;
		const globs = Array.isArray(parsed.globs)
			? parsed.globs.map(g => normalizeRel(String(g))).filter(Boolean)
			: [];
		return { schema: DROX_CODEBASE_EXCLUSIONS_SCHEMA, globs };
	} catch {
		return { schema: DROX_CODEBASE_EXCLUSIONS_SCHEMA, globs: [] };
	}
}

export async function droxCodebaseWriteExclusions(
	fileService: IFileService,
	workspaceRootFsPath: string,
	globs: readonly string[],
): Promise<IDroxCodebaseExclusions> {
	const indexDir = URI.file(droxCodebaseIndexDir(workspaceRootFsPath));
	await fileService.createFolder(indexDir);
	const payload: IDroxCodebaseExclusions = {
		schema: DROX_CODEBASE_EXCLUSIONS_SCHEMA,
		globs: droxCodebaseMergeExclusionGlobs([], globs),
	};
	await fileService.writeFile(
		URI.file(droxCodebaseExclusionsPath(workspaceRootFsPath)),
		VSBuffer.fromString(JSON.stringify(payload, null, 2)),
	);
	return payload;
}
