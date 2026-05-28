/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { applyEdits, IDroxEditOp } from './droxFileEdit.js';

export type DroxCellEditMode = 'replace' | 'insert' | 'delete';

export interface IDroxNotebookCellEdit {
	cell_index: number;
	edit_mode?: DroxCellEditMode;
	old_string: string;
	new_string: string;
	replace_all?: boolean;
	cell_type?: string;
}

export interface IDroxNotebookEditInput {
	path: string;
	edits: IDroxNotebookCellEdit[];
}

function pickOneString(
	o: Record<string, unknown>,
	label: string,
	keys: string[],
): string | undefined {
	let chosen: string | undefined;
	for (const k of keys) {
		const v = o[k];
		if (typeof v !== 'string') {
			continue;
		}
		if (chosen !== undefined && chosen !== v) {
			throw new Error(
				`notebook_edit: conflicting values for ${label} (${keys.join(' / ')})`,
			);
		}
		chosen = v;
	}
	return chosen;
}

function pickUsize(o: Record<string, unknown>, keys: string[]): number | undefined {
	for (const k of keys) {
		const v = o[k];
		if (typeof v === 'number' && Number.isInteger(v) && v >= 0) {
			return v;
		}
		if (typeof v === 'string' && /^\d+$/.test(v)) {
			return Number.parseInt(v, 10);
		}
	}
	return undefined;
}

function parseEditMode(raw: unknown): DroxCellEditMode {
	if (typeof raw !== 'string') {
		return 'replace';
	}
	const m = raw.toLowerCase();
	if (m === 'insert') {
		return 'insert';
	}
	if (m === 'delete') {
		return 'delete';
	}
	return 'replace';
}

function parseEditObject(e: Record<string, unknown>): IDroxNotebookCellEdit {
	const idx = e.cell_index ?? e.cellIndex ?? e.cell_number;
	if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0) {
		throw new Error('notebook_edit: each edit needs non-negative integer `cell_index`');
	}
	const oldStr = pickOneString(e, 'old_string', ['old_string', 'old', 'oldString']) ?? '';
	const newStr =
		pickOneString(e, 'new_string', ['new_string', 'new', 'newString', 'new_source']) ?? '';
	const cellType = pickOneString(e, 'cell_type', ['cell_type']);
	return {
		cell_index: idx,
		edit_mode: parseEditMode(e.edit_mode),
		old_string: oldStr,
		new_string: newStr,
		replace_all: Boolean(e.replace_all),
		cell_type: cellType,
	};
}

function parseInput(input: unknown): IDroxNotebookEditInput {
	if (!input || typeof input !== 'object') {
		throw new Error('notebook_edit: input must be an object');
	}
	const o = input as Record<string, unknown>;
	const filePath = pickOneString(o, 'path', ['path', 'file_path', 'notebook_path']);
	if (typeof filePath !== 'string' || !Array.isArray(o.edits)) {
		throw new Error(
			'notebook_edit: input requires `path` or `file_path` (string) and `edits` (array)',
		);
	}
	const edits: IDroxNotebookCellEdit[] = [];
	for (const raw of o.edits) {
		if (!raw || typeof raw !== 'object') {
			throw new Error('notebook_edit: each edit must be an object');
		}
		edits.push(parseEditObject(raw as Record<string, unknown>));
	}
	return { path: filePath, edits };
}

/** Aligné extension + moteur `drox-tools::notebook_edit::normalize_input`. */
export function normalizeNotebookEditInput(input: unknown): IDroxNotebookEditInput {
	if (!input || typeof input !== 'object') {
		throw new Error('notebook_edit: input must be an object');
	}
	const o = input as Record<string, unknown>;

	try {
		return parseInput(input);
	} catch {
		// fall through
	}

	const pathStr = pickOneString(o, 'path', ['path', 'file_path', 'notebook_path']);
	if (!pathStr) {
		throw new Error('notebook_edit: missing path (or notebook_path)');
	}

	if ('new_source' in o) {
		const newSource =
			pickOneString(o, 'new_source', ['new_source', 'new_string', 'new']) ?? '';
		const cellIndex = pickUsize(o, ['cell_index', 'cell_number', 'cellIndex']) ?? 0;
		const editMode = parseEditMode(o.edit_mode);
		const cellType = pickOneString(o, 'cell_type', ['cell_type']);
		return {
			path: pathStr,
			edits: [{
				cell_index: cellIndex,
				edit_mode: editMode,
				old_string: '',
				new_string: newSource,
				cell_type: cellType,
			}],
		};
	}

	if ('cell_index' in o || 'cell_number' in o) {
		const cellIndex = pickUsize(o, ['cell_index', 'cell_number', 'cellIndex']) ?? 0;
		const editMode = parseEditMode(o.edit_mode);
		const oldStr =
			pickOneString(o, 'old_string', ['old_string', 'old', 'oldString']) ?? '';
		const newStr =
			pickOneString(o, 'new_string', [
				'new_string',
				'new',
				'newString',
				'new_source',
			]) ?? '';
		const cellType = pickOneString(o, 'cell_type', ['cell_type']);
		return {
			path: pathStr,
			edits: [{
				cell_index: cellIndex,
				edit_mode: editMode,
				old_string: oldStr,
				new_string: newStr,
				cell_type: cellType,
			}],
		};
	}

	if (o.edit && typeof o.edit === 'object') {
		const edit = parseEditObject(o.edit as Record<string, unknown>);
		return { path: pathStr, edits: [edit] };
	}

	throw new Error(
		'notebook_edit: expected {"path":"nb.ipynb","edits":[{"cell_index":0,"old_string":"…","new_string":"…"}]}',
	);
}

function sourceToString(source: unknown): string {
	if (typeof source === 'string') {
		return source;
	}
	if (Array.isArray(source)) {
		return source.map(p => (typeof p === 'string' ? p : '')).join('');
	}
	if (source == null) {
		return '';
	}
	throw new Error('notebook_edit: cell "source" must be string or string[]');
}

function resetCodeCellExecution(cell: Record<string, unknown>): void {
	if (cell.cell_type === 'code') {
		cell.execution_count = null;
		cell.outputs = [];
	}
}

function hashString(s: string): string {
	let h = 0xcbf29ce484222325;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x100000001b3);
	}
	return (h >>> 0).toString(16);
}

function newCellValue(cellType: string | undefined, source: string): Record<string, unknown> {
	const ct = cellType?.toLowerCase() === 'markdown' ? 'markdown' : 'code';
	const cell: Record<string, unknown> = {
		cell_type: ct,
		metadata: {},
		source,
		id: `drox-${hashString(source)}`,
	};
	if (ct === 'code') {
		cell.execution_count = null;
		cell.outputs = [];
	}
	return cell;
}

export function applyNotebookCellEdits(cells: unknown[], edits: IDroxNotebookCellEdit[]): void {
	for (let i = 0; i < edits.length; i++) {
		const edit = edits[i]!;
		const mode = edit.edit_mode ?? 'replace';
		if (mode === 'delete') {
			if (edit.cell_index >= cells.length) {
				throw new Error(
					`edit #${i}: cell_index ${edit.cell_index} out of range (len=${cells.length})`,
				);
			}
			cells.splice(edit.cell_index, 1);
			continue;
		}
		if (mode === 'insert') {
			if (!edit.new_string) {
				throw new Error(`edit #${i}: insert requires non-empty new_string`);
			}
			if (edit.cell_index > cells.length) {
				throw new Error(
					`edit #${i}: cell_index ${edit.cell_index} out of range for insert`,
				);
			}
			cells.splice(
				edit.cell_index,
				0,
				newCellValue(edit.cell_type, edit.new_string),
			);
			continue;
		}
		const cell = cells[edit.cell_index];
		if (!cell || typeof cell !== 'object') {
			throw new Error(
				`edit #${i}: cell_index ${edit.cell_index} out of range or invalid`,
			);
		}
		const c = cell as Record<string, unknown>;
		if (!('source' in c)) {
			throw new Error(`edit #${i}: cell ${edit.cell_index} has no "source"`);
		}
		let next: string;
		if (!edit.old_string) {
			next = edit.new_string;
		} else {
			const srcStr = sourceToString(c.source);
			const patch: IDroxEditOp = {
				old_string: edit.old_string,
				new_string: edit.new_string,
				replace_all: edit.replace_all,
			};
			next = applyEdits(srcStr, [patch]);
		}
		c.source = next;
		resetCodeCellExecution(c);
	}
}

export function serializeNotebook(nb: Record<string, unknown>): string {
	return `${JSON.stringify(nb, null, 2)}\n`;
}
