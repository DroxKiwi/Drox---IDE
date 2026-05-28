/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

export interface IDroxEditOp {

	old_string: string;

	new_string: string;

	replace_all?: boolean;

}



export interface IDroxFileEditInput {

	path: string;

	edits: IDroxEditOp[];

}



function pickOneString(o: Record<string, unknown>, label: string, keys: string[]): string | undefined {

	let chosen: string | undefined;

	for (const k of keys) {

		const v = o[k];

		if (typeof v !== 'string') {

			continue;

		}

		if (chosen !== undefined && chosen !== v) {

			throw new Error(`file_edit: conflicting values for ${label} (${keys.join(' / ')})`);

		}

		chosen = v;

	}

	return chosen;

}



export function parseFileEditInput(input: unknown): IDroxFileEditInput {

	if (!input || typeof input !== 'object') {

		throw new Error('file_edit: input must be an object');

	}

	const o = input as Record<string, unknown>;

	const filePath = pickOneString(o, 'path', ['path', 'file_path']);

	if (typeof filePath !== 'string' || !Array.isArray(o.edits)) {

		throw new Error('file_edit: input requires `path` or `file_path` (string) and `edits` (array)');

	}

	const edits: IDroxEditOp[] = [];

	for (const raw of o.edits) {

		if (!raw || typeof raw !== 'object') {

			throw new Error('file_edit: each edit must be an object');

		}

		const e = raw as Record<string, unknown>;

		const oldStr = pickOneString(e, 'old_string', ['old_string', 'old', 'oldString']);

		const newStr = pickOneString(e, 'new_string', ['new_string', 'new', 'newString']);

		if (oldStr === undefined || newStr === undefined) {

			throw new Error('file_edit: each edit needs `old_string` and `new_string`');

		}

		edits.push({

			old_string: oldStr,

			new_string: newStr,

			replace_all: Boolean(e.replace_all),

		});

	}

	return { path: filePath, edits };

}



/** Aligné sur `drox_tools::simple::file_edit::apply_edits`. */

export function applyEdits(original: string, edits: IDroxEditOp[]): string {

	let current = original;

	for (let idx = 0; idx < edits.length; idx++) {

		const edit = edits[idx]!;

		if (edit.old_string === edit.new_string) {

			throw new Error(`edit #${idx}: old_string == new_string`);

		}

		if (edit.old_string.length === 0) {

			throw new Error(`edit #${idx}: old_string is empty`);

		}

		if (edit.replace_all) {

			if (!current.includes(edit.old_string)) {

				throw new Error(`edit #${idx}: old_string not found`);

			}

			current = current.split(edit.old_string).join(edit.new_string);

		} else {

			const count = occurrences(current, edit.old_string);

			if (count === 0) {

				throw new Error(`edit #${idx}: old_string not found`);

			}

			if (count > 1) {

				throw new Error(`edit #${idx}: old_string found ${count} times (need unique or replace_all=true)`);

			}

			current = current.replace(edit.old_string, edit.new_string);

		}

	}

	return current;

}



function occurrences(haystack: string, needle: string): number {

	if (needle.length === 0) {

		return 0;

	}

	let n = 0;

	let pos = 0;

	while (true) {

		const i = haystack.indexOf(needle, pos);

		if (i < 0) {

			break;

		}

		n += 1;

		pos = i + needle.length;

	}

	return n;

}

/** Rejette les réécritures quasi complètes du fichier (L-014, profil Low surtout). */
export function validateFileEditScope(
	original: string,
	edits: readonly IDroxEditOp[],
): string | undefined {
	if (original.length < 80) {
		return undefined;
	}
	const origTrim = original.trim();
	let totalOld = 0;
	for (const e of edits) {
		totalOld += e.old_string.length;
		if (e.replace_all) {
			return 'file_edit: replace_all on a large file is discouraged — use a unique old_string hunk';
		}
		const oldTrim = e.old_string.trim();
		if (oldTrim.length >= origTrim.length * 85 / 100) {
			return 'file_edit: old_string covers almost the entire file — target a smaller hunk (few lines)';
		}
	}
	if (totalOld > original.length * 55 / 100) {
		return 'file_edit: combined old_string spans more than half the file — split into smaller edits';
	}
	return undefined;
}

