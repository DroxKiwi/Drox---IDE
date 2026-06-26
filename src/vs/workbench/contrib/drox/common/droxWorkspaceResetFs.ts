/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IDroxWorkspaceResetResult } from './droxSessionService.js';

const PRESERVED_DROX_ENTRY_NAMES = new Set(['.env']);

function emptyResetResult(): IDroxWorkspaceResetResult {
	return {
		sessionsFilesRemoved: 0,
		workspaceMapRemoved: false,
		longMemoryCleared: false,
		memorySessionsFilesRemoved: 0,
		attachmentsCleared: false,
		courseCyclesCleared: false,
		agentOutputCleared: false,
		memoryMdRemoved: false,
	};
}

async function countFilesRecursive(fileService: IFileService, root: URI): Promise<number> {
	if (!(await fileService.exists(root))) {
		return 0;
	}
	const resolved = await fileService.resolve(root);
	let count = 0;
	for (const child of resolved.children ?? []) {
		if (child.isDirectory) {
			count += await countFilesRecursive(fileService, child.resource);
		} else {
			count += 1;
		}
	}
	return count;
}

/**
 * Purge `.drox/` du workspace (conserve uniquement `.drox/.env`) et `MEMORY.md` à la racine.
 * Remplace l’ancien RPC moteur `workspace.reset` (non implémenté côté `drox-cli`).
 */
export async function resetDroxWorkspaceOnDisk(
	fileService: IFileService,
	workspaceFsPath: string,
): Promise<IDroxWorkspaceResetResult> {
	const result = { ...emptyResetResult() };

	const memoryMdUri = URI.file(join(workspaceFsPath, 'MEMORY.md'));
	if (await fileService.exists(memoryMdUri)) {
		await fileService.del(memoryMdUri, { recursive: false, useTrash: false });
		result.memoryMdRemoved = true;
	}

	const droxUri = URI.file(join(workspaceFsPath, '.drox'));
	if (!(await fileService.exists(droxUri))) {
		return result;
	}

	const resolved = await fileService.resolve(droxUri);
	for (const child of resolved.children ?? []) {
		const name = child.name;
		if (PRESERVED_DROX_ENTRY_NAMES.has(name)) {
			continue;
		}
		if (name === 'sessions') {
			result.sessionsFilesRemoved = await countFilesRecursive(fileService, child.resource);
		} else if (name === 'memory') {
			const memorySessions = URI.file(join(child.resource.fsPath, 'sessions'));
			result.memorySessionsFilesRemoved = await countFilesRecursive(fileService, memorySessions);
			if (await fileService.exists(child.resource)) {
				result.longMemoryCleared = true;
			}
		} else if (name === 'workspace-map.json' || name === 'workspace-map.md') {
			result.workspaceMapRemoved = true;
		} else if (name === 'long-memory') {
			result.longMemoryCleared = true;
		} else if (name === 'attachments') {
			result.attachmentsCleared = true;
		} else if (name === 'course-cycles') {
			result.courseCyclesCleared = true;
		} else if (name === 'agent-output') {
			result.agentOutputCleared = true;
		}
		await fileService.del(child.resource, { recursive: true, useTrash: false });
	}
	return result;
}
