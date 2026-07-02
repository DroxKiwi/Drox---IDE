/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as path from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';

const MCP_REGISTRY_RELATIVE = path.join('drox-engine', 'mcp-registry');
const MCP_REGISTRY_SERVERS_RELATIVE = path.join('v0.1', 'servers');

export interface IDroxMcpRegistryResolveOptions {
	readonly workspaceFolderPaths: readonly string[];
	readonly appRoot?: string;
	readonly installDir?: string;
}

function* walkUpDirectories(start: string, maxDepth: number): Generator<string> {
	let current = start;
	for (let depth = 0; depth < maxDepth; depth++) {
		yield current;
		const parent = path.dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}
}

/** Candidate base directories (each contains `v0.1/servers`). */
export function enumerateDroxMcpRegistryCandidates(options: IDroxMcpRegistryResolveOptions): string[] {
	const seen = new Set<string>();
	const candidates: string[] = [];
	const push = (basePath: string) => {
		const normalized = path.normalize(basePath);
		if (!seen.has(normalized)) {
			seen.add(normalized);
			candidates.push(normalized);
		}
	};

	for (const root of options.workspaceFolderPaths) {
		push(path.join(root, MCP_REGISTRY_RELATIVE));
	}

	if (options.appRoot) {
		for (const dir of walkUpDirectories(options.appRoot, 8)) {
			push(path.join(dir, MCP_REGISTRY_RELATIVE));
		}
	}

	if (options.installDir) {
		push(path.join(options.installDir, 'resources', 'app', MCP_REGISTRY_RELATIVE));
		push(path.join(options.installDir, MCP_REGISTRY_RELATIVE));
	}

	return candidates;
}

/**
 * Resolves a bundled Drox MCP registry base URL (`file:`) when `v0.1/servers` exists on disk.
 */
export async function resolveDroxBundledMcpRegistryBaseUrl(
	fileService: IFileService,
	options: IDroxMcpRegistryResolveOptions,
): Promise<string | undefined> {
	for (const basePath of enumerateDroxMcpRegistryCandidates(options)) {
		const serversUri = URI.file(path.join(basePath, MCP_REGISTRY_SERVERS_RELATIVE));
		try {
			if (await fileService.exists(serversUri)) {
				return URI.file(basePath).toString(true);
			}
		} catch {
			// try next candidate
		}
	}
	return undefined;
}
