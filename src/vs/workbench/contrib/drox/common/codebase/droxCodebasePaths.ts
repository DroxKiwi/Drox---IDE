/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../../../base/common/path.js';

/** Relative folder under a workspace root that holds the local codebase index. */
export const DROX_CODEBASE_INDEX_DIRNAME = '.drox/codebase-index';

/**
 * Absolute path of the index directory for a workspace root.
 * Identity of an index instance = canonical workspace root path (not git remote).
 */
export function droxCodebaseIndexDir(workspaceRootFsPath: string): string {
	return join(workspaceRootFsPath, '.drox', 'codebase-index');
}

export function droxCodebaseManifestPath(workspaceRootFsPath: string): string {
	return join(droxCodebaseIndexDir(workspaceRootFsPath), 'manifest.json');
}

/** CB1 lexical store (JSON). SQLite path reserved for CB2+ vectors. */
export function droxCodebaseChunksJsonPath(workspaceRootFsPath: string): string {
	return join(droxCodebaseIndexDir(workspaceRootFsPath), 'chunks.json');
}

/** CB2 embedding rows (JSON) — one vector per chunk id. */
export function droxCodebaseVectorsJsonPath(workspaceRootFsPath: string): string {
	return join(droxCodebaseIndexDir(workspaceRootFsPath), 'vectors.json');
}

export function droxCodebaseChunksDbPath(workspaceRootFsPath: string): string {
	return join(droxCodebaseIndexDir(workspaceRootFsPath), 'chunks.sqlite');
}
