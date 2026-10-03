/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { isAbsolute, join, normalize } from '../../../../base/common/path.js';
import { applyEdits, parseFileEditInput } from './droxFileEdit.js';
import { languageIdForFile } from './droxFileLanguage.js';
import {
	DroxFileMutationToolName,
	normalizeToolArguments,
	toolArgPath,
	toolOutputIndicatesApplied,
} from './droxFileMutation.js';
import { normalizeWindowsFsPath } from './droxPathUtil.js';
import { unifiedDiff } from './droxUnifiedDiff.js';

export interface IDroxFileChangePayload {
	readonly op: 'edit' | 'write' | 'delete';
	readonly path: string;
	readonly relPath: string;
	readonly added: number;
	readonly removed: number;
	readonly diff: string;
	readonly content: string;
	readonly language: string;
	/** `false` si écriture refusée, plan mode, ou proposition non appliquée. */
	readonly applied: boolean;
	readonly cancelled?: boolean;
	readonly proposed?: boolean;
	/** Undo / redo depuis la carte (run appliqué uniquement). */
	readonly toolId?: string;
	readonly canUndo?: boolean;
	/** Snapshot disque `.drox/diff-snapshots/{toolId}.before` pour diff éditeur. */
	readonly beforeSnapshotUri?: string;
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

export function extractOutputPath(out: Record<string, unknown>): string | null {
	if (typeof out.path === 'string' && out.path.length > 0) {
		return out.path;
	}
	if (typeof out.file_path === 'string' && out.file_path.length > 0) {
		return out.file_path;
	}
	return null;
}

export { normalizeToolArguments } from './droxFileMutation.js';

/** Résout un chemin modèle (relatif ou absolu) sous le workspace. */
export function resolveWorkspaceFilePath(workspaceRoot: string | undefined, userPath: string): string {
	const trimmed = normalizeWindowsFsPath(userPath.trim());
	if (!trimmed) {
		return '';
	}
	const ws = workspaceRoot ? normalizeWindowsFsPath(workspaceRoot) : '';
	const joined = isAbsolute(trimmed)
		? normalize(trimmed)
		: ws
			? normalize(join(ws, trimmed))
			: normalize(trimmed);
	return joined.replace(/\\/g, '/');
}

/**
 * Aperçu diff **avant** exécution disque — à partir des args `tool_start`.
 * Permet d'afficher la carte fichier pendant la confirmation / l'écriture.
 */
export async function buildProposedFileChangeFromToolArgs(
	workspaceRoot: string | undefined,
	toolName: DroxFileMutationToolName,
	args: unknown,
	readTextIfExists?: (absPath: string) => Promise<string | undefined>,
): Promise<IDroxFileChangePayload | null> {
	const argPath = toolArgPath(args);
	if (!argPath) {
		return null;
	}
	const absPath = resolveWorkspaceFilePath(workspaceRoot, argPath);
	if (!absPath) {
		return null;
	}
	const normalized = normalizeToolArguments(args);
	if (!normalized) {
		return null;
	}

	let before = '';
	if (readTextIfExists) {
		try {
			const existing = await readTextIfExists(absPath);
			if (typeof existing === 'string') {
				before = existing;
			}
		} catch {
			// fichier absent ou illisible — création ou preview partielle
		}
	}

	const relPath = relativePathUnderWorkspace(workspaceRoot, absPath);
	const language = languageIdForFile(absPath);
	const pendingBase = {
		path: absPath,
		relPath,
		language,
		applied: false,
		proposed: true,
	};

	if (toolName === 'file_write') {
		const content = typeof normalized.content === 'string' ? normalized.content : '';
		const base: IDroxFileChangePayload = {
			...pendingBase,
			op: 'write',
			added: 0,
			removed: 0,
			diff: '',
			content: '',
		};
		return enrichFileChangePayload(base, before, content);
	}

	if (toolName === 'file_edit') {
		try {
			const parsed = parseFileEditInput(normalized);
			const after = applyEdits(before, parsed.edits);
			const base: IDroxFileChangePayload = {
				...pendingBase,
				op: 'edit',
				added: 0,
				removed: 0,
				diff: '',
				content: '',
			};
			return enrichFileChangePayload(base, before, after);
		} catch {
			return {
				...pendingBase,
				op: 'edit',
				added: 0,
				removed: 0,
				diff: '',
				content: '',
			};
		}
	}

	return {
		...pendingBase,
		op: 'edit',
		added: 0,
		removed: 0,
		diff: '',
		content: '',
	};
}

/** Contenu proposé / écrit — issu des args `tool_start` ou de la sortie outil. */
export function extractFileMutationContent(
	toolName: DroxFileMutationToolName,
	out: Record<string, unknown>,
	pendingArgs?: unknown,
): string {
	const args = normalizeToolArguments(pendingArgs);
	if (args && typeof args.content === 'string') {
		return args.content;
	}
	if (typeof out.content === 'string') {
		return out.content;
	}
	if (typeof out.new_content === 'string') {
		return out.new_content;
	}
	if (toolName === 'file_edit' || toolName === 'notebook_edit') {
		return '';
	}
	return '';
}

export function enrichFileChangePayload(
	base: IDroxFileChangePayload,
	beforeContent: string,
	afterContent: string,
): IDroxFileChangePayload {
	if (base.diff || base.content) {
		return base;
	}
	const before = beforeContent ?? '';
	const after = afterContent ?? '';
	if (!before && !after) {
		return base;
	}
	const diff = unifiedDiff(base.path, before, after);
	const counts = countDiffLines(diff);
	return {
		...base,
		diff,
		content: '',
		added: counts.added > 0 ? counts.added : after.length > 0 ? after.split('\n').length : 0,
		removed: counts.removed,
		op:
			base.op === 'write' || (!before && after)
				? 'write'
				: !after && before
					? 'delete'
					: 'edit',
	};
}

export async function resolveFileChangePayload(
	workspaceRoot: string | undefined,
	toolName: DroxFileMutationToolName,
	out: Record<string, unknown>,
	pendingArgs: unknown | undefined,
	options: { readonly applied?: boolean; readonly cancelled?: boolean; readonly proposed?: boolean },
	readAfterContent?: (absPath: string) => Promise<string>,
	beforeContent = '',
): Promise<IDroxFileChangePayload | null> {
	const base = buildFileChangePayload(workspaceRoot, toolName, out, pendingArgs, options);
	if (!base) {
		return null;
	}
	if (base.diff || base.content) {
		return base;
	}
	let after = extractFileMutationContent(toolName, out, pendingArgs);
	if (!after && base.applied && readAfterContent) {
		after = await readAfterContent(base.path);
	}
	return enrichFileChangePayload(base, beforeContent, after);
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
	options?: { readonly applied?: boolean; readonly cancelled?: boolean; readonly proposed?: boolean },
): IDroxFileChangePayload | null {
	const filePath = extractOutputPath(out);
	if (!filePath) {
		return null;
	}

	const applied = options?.applied ?? toolOutputIndicatesApplied(toolName, out);

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
		if (!diff && typeof out.new_content === 'string') {
			content = out.new_content;
			added = content.length === 0 ? 0 : content.split('\n').length;
		}
	} else {
		const args = normalizeToolArguments(pendingArgs);
		content = args && typeof args.content === 'string' ? args.content : '';
		if (!content && typeof out.content === 'string') {
			content = out.content;
		}
		if (!content && typeof out.new_content === 'string') {
			content = out.new_content;
		}
		diff = typeof out.diff === 'string' ? out.diff : '';
		if (diff) {
			const counts = countDiffLines(diff);
			added = counts.added;
			removed = counts.removed;
		} else if (content) {
			added = content.length === 0 ? 0 : content.split('\n').length;
		}
	}

	if (!diff && !content && !applied) {
		return null;
	}

	const absPath = resolveWorkspaceFilePath(workspaceRoot, filePath) || filePath;
	return {
		op: toolName === 'file_write' ? 'write' : 'edit',
		path: absPath,
		relPath: relativePathUnderWorkspace(workspaceRoot, absPath),
		added,
		removed,
		diff,
		content,
		language: languageIdForFile(absPath),
		applied,
		cancelled: options?.cancelled ?? out.cancelled === true,
		proposed: options?.proposed ?? out.proposed === true,
	};
}
