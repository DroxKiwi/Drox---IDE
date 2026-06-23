/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { normalizeToolArguments } from '../droxFileMutation.js';

const MAX_JSON_CHARS = 1800;



export function previewJson(value: unknown, max = MAX_JSON_CHARS): string {

	try {

		const s = JSON.stringify(value, null, 2);

		if (s.length <= max) {

			return s;

		}

		return `${s.slice(0, max)}…`;

	} catch {

		return String(value);

	}

}



function shortString(s: string, max = 80): string {

	const one = s.replace(/\s+/g, ' ').trim();

	return one.length > max ? `${one.slice(0, max)}…` : one;

}



export function describeToolCall(

	name: string,

	args: unknown,

): { verb: string; target: string } {

	const a = normalizeToolArguments(args) ?? {};

	const asStr = (v: unknown): string => (typeof v === 'string' ? v : '');



	switch (name) {

		case 'file_read': {

			const p = shortString(asStr(a.path));

			return { verb: 'Read', target: p };

		}

		case 'file_write':

			return { verb: 'Wrote', target: shortString(asStr(a.path)) };

		case 'file_edit':

			return { verb: 'Edited', target: shortString(asStr(a.path)) };

		case 'notebook_edit':

			return { verb: 'Edited notebook', target: shortString(asStr(a.path) || asStr(a.file_path)) };

		case 'grep':

			return { verb: 'Searched', target: shortString(asStr(a.pattern)) };

		case 'glob':

			return { verb: 'Listed', target: shortString(asStr(a.pattern)) };

		case 'bash':

			return { verb: 'Ran', target: shortString(asStr(a.command), 100) };

		case 'web_fetch':

			return { verb: 'Fetched', target: shortString(asStr(a.url)) };

		case 'web_search':

			return { verb: 'Searched web', target: shortString(asStr(a.search_term) || asStr(a.query)) };

		case 'task': {
			const desc = shortString(asStr(a.description), 60);
			const asyncMode = a.background === true;
			return {
				verb: asyncMode ? 'Explore (Async)' : 'Explore (Sync)',
				target: desc,
			};
		}

		case 'lsp': {
			const op = asStr(a.op) || '?';
			if (op === 'diagnostics') {
				const where = asStr(a.path);
				return { verb: 'LSP diagnostics', target: where ? shortString(where) : '(workspace)' };
			}
			if (op === 'workspace_symbol') {
				return { verb: 'LSP search symbol', target: shortString(asStr(a.query) || asStr(a.symbol)) };
			}
			const sym = asStr(a.symbol);
			const where = asStr(a.path);
			const pos = a.position as { line?: number; character?: number } | undefined;
			const at =
				sym ||
				(pos && typeof pos.line === 'number'
					? `${where}:${pos.line + 1}:${pos.character ?? 0}`
					: where);
			return { verb: `LSP ${op}`, target: shortString(at) };
		}

		default:

			return { verb: name, target: '' };

	}

}


