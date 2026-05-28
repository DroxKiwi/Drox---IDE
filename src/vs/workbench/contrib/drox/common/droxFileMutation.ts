/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

export type DroxFileMutationToolName = 'file_edit' | 'file_write' | 'notebook_edit';

export function isFileMutationToolName(name: string | undefined): name is DroxFileMutationToolName {
	return name === 'file_edit' || name === 'file_write' || name === 'notebook_edit';
}

/** Normalise la sortie JSON d'un tool (objet ou chaîne JSON). */
export function normalizeToolFinishOutput(output: unknown): Record<string, unknown> | null {
	if (output === null || output === undefined) {
		return null;
	}
	if (typeof output === 'string') {
		try {
			const v = JSON.parse(output) as unknown;
			return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
		} catch {
			return null;
		}
	}
	if (typeof output === 'object') {
		return output as Record<string, unknown>;
	}
	return null;
}

/** Détecte une écriture réussie même si `applied` manque (robustesse serde). */
export function toolOutputIndicatesApplied(
	toolName: DroxFileMutationToolName,
	out: Record<string, unknown>,
): boolean {
	if (out.applied === true || out.applied === 1) {
		return true;
	}
	if (out.error !== undefined) {
		return false;
	}
	if (
		toolName === 'file_edit' &&
		typeof out.edits_applied === 'number' &&
		out.edits_applied > 0
	) {
		return true;
	}
	if (toolName === 'file_write' && typeof out.bytes_written === 'number') {
		return true;
	}
	if (
		toolName === 'notebook_edit' &&
		typeof out.cell_edits_applied === 'number' &&
		out.cell_edits_applied > 0
	) {
		return true;
	}
	return false;
}

/** `path` ou `file_path` dans les arguments d'un tool fichier. */
export function toolArgPath(args: unknown): string {
	if (!args || typeof args !== 'object') {
		return '';
	}
	const o = args as Record<string, unknown>;
	const p = o.path ?? o.file_path;
	return typeof p === 'string' ? p.replace(/\\/g, '/') : '';
}

/**
 * Récupère le pending d'un `tool_finish` par id, sinon par chemin fichier
 * (si `tool_start` / `tool_finish` n'ont pas le même `ToolUseId`).
 */
export function takePendingForFileFinish(
	pendingTools: Map<string, { name: string; args: unknown }>,
	toolFinishId: string,
	output: unknown,
): { name: string; args: unknown } | undefined {
	if (toolFinishId && toolFinishId !== '?' && pendingTools.has(toolFinishId)) {
		const p = pendingTools.get(toolFinishId)!;
		pendingTools.delete(toolFinishId);
		return p;
	}
	const out = normalizeToolFinishOutput(output);
	const outPath =
		out && typeof out.path === 'string' ? out.path.replace(/\\/g, '/') : null;
	if (!outPath) {
		return undefined;
	}
	for (const [pid, pend] of pendingTools) {
		if (!isFileMutationToolName(pend.name)) {
			continue;
		}
		const ap = toolArgPath(pend.args);
		if (!ap) {
			continue;
		}
		const apClean = ap.replace(/^\.\/+/, '');
		if (
			outPath === ap ||
			outPath.endsWith('/' + ap) ||
			outPath.endsWith('/' + apClean) ||
			outPath.toLowerCase().endsWith('/' + apClean.toLowerCase())
		) {
			pendingTools.delete(pid);
			return pend;
		}
	}
	return undefined;
}

export function inferFileToolName(out: Record<string, unknown>): DroxFileMutationToolName | null {
	if (typeof out.cell_edits_applied === 'number' && out.cell_edits_applied > 0) {
		return 'notebook_edit';
	}
	if (typeof out.edits_applied === 'number') {
		return 'file_edit';
	}
	if (typeof out.bytes_written === 'number') {
		return 'file_write';
	}
	if (typeof out.diff === 'string' && out.diff.length > 0) {
		return 'file_edit';
	}
	return null;
}
