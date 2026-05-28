/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxEditOp } from './droxFileEdit.js';

function asRecord(input: unknown): Record<string, unknown> | undefined {
	return input && typeof input === 'object' && !Array.isArray(input)
		? (input as Record<string, unknown>)
		: undefined;
}

function tryParseJsonObject(input: unknown): Record<string, unknown> | undefined {
	if (typeof input === 'string') {
		const t = input.trim();
		if (!t.startsWith('{') && !t.startsWith('[')) {
			return undefined;
		}
		try {
			const v = JSON.parse(t) as unknown;
			return asRecord(v);
		} catch {
			return undefined;
		}
	}
	return asRecord(input);
}

function pickString(o: Record<string, unknown>, keys: string[]): string | undefined {
	for (const k of keys) {
		const v = o[k];
		if (typeof v === 'string' && v.trim()) {
			return v.trim();
		}
	}
	return undefined;
}

function normalizeEditOp(raw: unknown): IDroxEditOp | undefined {
	const e = asRecord(raw);
	if (!e) {
		return undefined;
	}
	const oldStr =
		typeof e.old_string === 'string' ? e.old_string
			: typeof e.old === 'string' ? e.old
				: typeof e.oldString === 'string' ? e.oldString
					: undefined;
	const newStr =
		typeof e.new_string === 'string' ? e.new_string
			: typeof e.new === 'string' ? e.new
				: typeof e.newString === 'string' ? e.newString
					: undefined;
	if (oldStr === undefined || newStr === undefined) {
		return undefined;
	}
	return {
		old_string: oldStr,
		new_string: newStr,
		replace_all: Boolean(e.replace_all ?? e.replaceAll),
	};
}

/** Tolère les payloads `file_edit` des petits modèles (champs à la racine, JSON stringifié, etc.). */
export function normalizeFileEditToolInput(input: unknown): unknown {
	const parsed = tryParseJsonObject(input);
	if (!parsed) {
		return input;
	}
	const o = { ...parsed };

	const path = pickString(o, ['path', 'file_path', 'filePath', 'file', 'target', 'filename']);
	if (path) {
		o.path = path;
	}

	let editsRaw = o.edits ?? o.edit;
	if (!editsRaw && typeof o.old_string === 'string' && typeof o.new_string === 'string') {
		editsRaw = [{
			old_string: o.old_string,
			new_string: o.new_string,
			replace_all: o.replace_all ?? o.replaceAll,
		}];
	}
	if (editsRaw && !Array.isArray(editsRaw)) {
		editsRaw = [editsRaw];
	}
	if (Array.isArray(editsRaw)) {
		const edits: IDroxEditOp[] = [];
		for (const item of editsRaw) {
			const op = normalizeEditOp(item);
			if (op) {
				edits.push(op);
			}
		}
		o.edits = edits;
	}

	delete o.edit;
	delete o.file_path;
	delete o.filePath;
	delete o.file;
	delete o.target;
	delete o.filename;
	delete o.old_string;
	delete o.new_string;
	delete o.replace_all;
	delete o.replaceAll;

	return o;
}

export interface IFileWriteNormalized {
	path: string;
	content: string;
}

/** Tolère alias de champs pour `file_write`. */
export function normalizeFileWriteToolInput(input: unknown): unknown {
	const parsed = tryParseJsonObject(input);
	if (!parsed) {
		return input;
	}
	const path = pickString(parsed, ['path', 'file_path', 'filePath', 'file', 'target', 'filename']);
	const content =
		typeof parsed.content === 'string' ? parsed.content
			: typeof parsed.body === 'string' ? parsed.body
				: typeof parsed.text === 'string' ? parsed.text
					: typeof parsed.new_content === 'string' ? parsed.new_content
						: typeof parsed.newContent === 'string' ? parsed.newContent
							: typeof parsed.contents === 'string' ? parsed.contents
								: undefined;
	if (!path || content === undefined) {
		return parsed;
	}
	return { path, content };
}

/** Applique la normalisation avant exécution client `tool/exec`. */
export function normalizeClientToolInput(toolName: string, input: unknown): unknown {
	switch (toolName) {
		case 'file_edit':
			return normalizeFileEditToolInput(input);
		case 'file_write':
			return normalizeFileWriteToolInput(input);
		default:
			return input;
	}
}
