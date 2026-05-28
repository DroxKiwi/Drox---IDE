/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { languageIdForFile } from './droxFileLanguage.js';
import { DroxFileMutationToolName } from './droxFileMutation.js';

export interface IDroxFileChangePayload {
	readonly op: 'edit' | 'write';
	readonly path: string;
	readonly relPath: string;
	readonly added: number;
	readonly removed: number;
	readonly diff: string;
	readonly content: string;
	readonly language: string;
	/** Corrélation `tool_finish` → insertion après le bloc outil dans la webview. */
	readonly toolId?: string;
}

/** Message hôte → webview : carte diff fichier dans le fil de chat. */
export type DroxFileChangeHostMessage = { readonly kind: 'fileChange' } & IDroxFileChangePayload;

export function asFileChangeHostMessage(
	change: IDroxFileChangePayload,
	toolId?: string,
): DroxFileChangeHostMessage {
	return { kind: 'fileChange', ...change, ...(toolId ? { toolId } : {}) };
}

/** Compte les +/- d'un diff unifié (lib `similar` / `droxUnifiedDiff`). */
export function countDiffLines(diff: string): { added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const line of diff.split('\n')) {
		if (line.startsWith('+++ ') || line.startsWith('--- ')) {
			continue;
		}
		if (line.startsWith('+')) {
			added += 1;
		} else if (line.startsWith('-')) {
			removed += 1;
		}
	}
	return { added, removed };
}

export function relativePathUnderWorkspace(workspaceRoot: string | undefined, filePath: string): string {
	const fpNorm = filePath.replace(/\\/g, '/');
	const wsNorm = workspaceRoot ? workspaceRoot.replace(/\\/g, '/') : '';
	if (wsNorm && (fpNorm === wsNorm || fpNorm.startsWith(wsNorm + '/'))) {
		return fpNorm.slice(wsNorm.length).replace(/^\/+/, '');
	}
	return fpNorm;
}

export function buildFileChangePayload(
	workspaceRoot: string | undefined,
	toolName: DroxFileMutationToolName,
	out: Record<string, unknown>,
	pendingArgs?: unknown,
): IDroxFileChangePayload | null {
	const filePath = typeof out.path === 'string' ? out.path : null;
	if (!filePath) {
		return null;
	}

	let added = 0;
	let removed = 0;
	let diff = '';
	let content = '';

	if (toolName === 'file_edit' || toolName === 'notebook_edit') {
		diff = typeof out.diff === 'string' ? out.diff : '';
		if (diff) {
			const counts = countDiffLines(diff);
			added = counts.added;
			removed = counts.removed;
		}
	} else {
		const args =
			pendingArgs && typeof pendingArgs === 'object'
				? (pendingArgs as Record<string, unknown>)
				: null;
		content = args && typeof args.content === 'string' ? args.content : '';
		if (!content && typeof out.content === 'string') {
			content = out.content;
		}
		added = content.length === 0 ? 0 : content.split('\n').length;
	}

	return {
		op: toolName === 'file_write' ? 'write' : 'edit',
		path: filePath,
		relPath: relativePathUnderWorkspace(workspaceRoot, filePath),
		added,
		removed,
		diff,
		content,
		language: languageIdForFile(filePath),
	};
}
