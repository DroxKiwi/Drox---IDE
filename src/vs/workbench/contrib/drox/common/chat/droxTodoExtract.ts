/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const TODO_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);

export interface IDroxTodoItemPayload {
	readonly id: string;
	readonly content: string;
	readonly status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
}

function normalizeToolFinishOutput(output: unknown): Record<string, unknown> | null {
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

export function isTodoWriteOutput(output: unknown): boolean {
	const out = normalizeToolFinishOutput(output);
	return !!out && Array.isArray(out.todos);
}

export function extractTodosFromToolOutput(output: unknown): IDroxTodoItemPayload[] | null {
	const out = normalizeToolFinishOutput(output);
	if (!out || !Array.isArray(out.todos)) {
		return null;
	}
	const result: IDroxTodoItemPayload[] = [];
	for (const raw of out.todos) {
		if (!raw || typeof raw !== 'object') {
			continue;
		}
		const r = raw as Record<string, unknown>;
		const id = normalizeTodoId(r.id);
		const content = typeof r.content === 'string' ? r.content.trim() : '';
		const statusRaw = typeof r.status === 'string' ? r.status : '';
		if (!id || !content || !TODO_STATUSES.has(statusRaw)) {
			continue;
		}
		result.push({
			id,
			content,
			status: statusRaw as IDroxTodoItemPayload['status'],
		});
	}
	return result.length > 0 ? result : null;
}

/** Accepte `id` string ou number (GLM / certains modèles envoient des ids numériques). */
function normalizeTodoId(raw: unknown): string {
	if (typeof raw === 'string') {
		return raw.trim();
	}
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return String(Math.trunc(raw));
	}
	return '';
}

export function extractTodoErrorMessage(output: unknown): string | null {
	const out = normalizeToolFinishOutput(output);
	if (!out) {
		return typeof output === 'string' ? output : null;
	}
	if (typeof out.error === 'string') {
		return out.error;
	}
	if (typeof out.message === 'string') {
		return out.message;
	}
	return null;
}
