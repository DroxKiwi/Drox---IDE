/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxFileChangePayload } from '../../../../../workbench/contrib/drox/common/droxFileChange.js';
import { DroxDiffDisplayRow } from '../../../../../workbench/contrib/drox/common/droxFileChangeCardDom.js';

export type { DroxDiffDisplayRow };

const CONTEXT_EDGE_LINES = 2;

type RawDiffLine = { readonly type: 'add' | 'remove' | 'context' | 'hunk'; readonly text: string };

function parseUnifiedDiffLines(diff: string, content: string, op: IDroxFileChangePayload['op']): RawDiffLine[] {
	const rawLines: RawDiffLine[] = [];
	const source = diff.trim().length > 0
		? diff
		: op === 'write'
			? content.split(/\r?\n/).map(line => `+${line}`).join('\n')
			: op === 'delete'
				? content.split(/\r?\n/).map(line => `-${line}`).join('\n')
				: '';

	for (const raw of source.split(/\r?\n/)) {
		if (
			raw.startsWith('--- ')
			|| raw.startsWith('+++ ')
			|| raw.startsWith('Index: ')
			|| raw.startsWith('==========')
		) {
			continue;
		}
		if (raw.startsWith('@@')) {
			rawLines.push({ type: 'hunk', text: raw });
		} else if (raw.startsWith('+') && !raw.startsWith('++')) {
			rawLines.push({ type: 'add', text: raw });
		} else if (raw.startsWith('-') && !raw.startsWith('--')) {
			rawLines.push({ type: 'remove', text: raw });
		} else {
			rawLines.push({ type: 'context', text: raw.length > 0 ? raw : ' ' });
		}
	}
	return rawLines;
}

function pushContextRun(result: DroxDiffDisplayRow[], run: RawDiffLine[]): void {
	if (run.length === 0) {
		return;
	}
	if (run.length <= CONTEXT_EDGE_LINES * 2) {
		for (const line of run) {
			result.push({ kind: 'context', text: line.text });
		}
		return;
	}
	for (let i = 0; i < CONTEXT_EDGE_LINES; i++) {
		result.push({ kind: 'context', text: run[i].text });
	}
	const hidden = run.slice(CONTEXT_EDGE_LINES, run.length - CONTEXT_EDGE_LINES);
	result.push({
		kind: 'collapsed',
		lineCount: hidden.length,
		hiddenLines: hidden.map(line => line.text),
	});
	for (let i = run.length - CONTEXT_EDGE_LINES; i < run.length; i++) {
		result.push({ kind: 'context', text: run[i].text });
	}
}

/** Diff unifié style Cursor : hunks visibles + barres repliables entre blocs de contexte. */
export function buildDroxCursorStyleDiffDisplay(change: IDroxFileChangePayload): DroxDiffDisplayRow[] {
	const rawLines = parseUnifiedDiffLines(change.diff, change.content, change.op);
	const result: DroxDiffDisplayRow[] = [];
	let index = 0;
	while (index < rawLines.length) {
		const line = rawLines[index];
		if (line.type === 'context') {
			const start = index;
			while (index < rawLines.length && rawLines[index].type === 'context') {
				index++;
			}
			pushContextRun(result, rawLines.slice(start, index));
			continue;
		}
		result.push({ kind: line.type, text: line.text });
		index++;
	}
	if (result.length === 0) {
		result.push({ kind: 'context', text: ' (no visible diff)' });
	}
	return result;
}
