/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { droxSdtcmLines, findDroxSdtcmQuote, IDroxSdtcmMap } from './droxSdtcmMap.js';

export interface IDroxSdtcmHunk {
	readonly startLine: number;
	readonly endLine: number;
	readonly baselineExcerpt: string;
	readonly currentExcerpt: string;
}

export interface IDroxSdtcmStaleBrick {
	readonly id: string;
	readonly line: number;
	readonly quote: string;
	readonly reason: 'gone' | 'moved' | 'mismatch';
	readonly foundLine?: number;
}

/** One cited file whose text no longer matches the SDTCM baseline. */
export interface IDroxSdtcmFocus {
	readonly path: string;
	readonly missing: boolean;
	readonly hunk?: IDroxSdtcmHunk;
	readonly stale: readonly IDroxSdtcmStaleBrick[];
}

/**
 * Middle of the file after a shared prefix and a shared suffix.
 * This is the SDTCM diff: current text against the copy stored with the map, not git.
 */
export function diffDroxSdtcmText(baseline: string, current: string): IDroxSdtcmHunk | undefined {
	if (baseline === current) {
		return undefined;
	}
	const before = droxSdtcmLines(baseline);
	const after = droxSdtcmLines(current);
	let start = 0;
	while (start < before.length && start < after.length && before[start] === after[start]) {
		start++;
	}
	let beforeEnd = before.length - 1;
	let afterEnd = after.length - 1;
	while (beforeEnd >= start && afterEnd >= start && before[beforeEnd] === after[afterEnd]) {
		beforeEnd--;
		afterEnd--;
	}
	return {
		startLine: start + 1,
		endLine: Math.max(start + 1, afterEnd + 1),
		baselineExcerpt: before.slice(start, Math.max(start, beforeEnd + 1)).join('\n'),
		currentExcerpt: after.slice(start, Math.max(start, afterEnd + 1)).join('\n'),
	};
}

export function focusDroxSdtcmMap(
	map: IDroxSdtcmMap,
	baseline: Readonly<Record<string, string>>,
	current: Readonly<Record<string, string | undefined>>,
): IDroxSdtcmFocus[] {
	const cited = new Map<string, Array<{ id: string; line: number; quote: string }>>();
	if (map.entry) {
		pushCited(cited, map.entry.file, { id: 'entry', line: map.entry.line, quote: map.entry.quote });
	}
	for (const brick of map.bricks) {
		pushCited(cited, brick.file, { id: brick.id, line: brick.line, quote: brick.quote });
	}
	const paths = new Set<string>([...cited.keys(), ...Object.keys(baseline)]);
	const focus: IDroxSdtcmFocus[] = [];
	for (const path of paths) {
		const bricks = cited.get(path) ?? [];
		if (!bricks.length && !Object.hasOwn(baseline, path)) {
			continue;
		}
		const now = current[path];
		if (now === undefined) {
			if (bricks.length) {
				focus.push({
					path,
					missing: true,
					stale: bricks.map(brick => ({ id: brick.id, line: brick.line, quote: brick.quote, reason: 'gone' })),
				});
			}
			continue;
		}
		const previous = Object.hasOwn(baseline, path) ? baseline[path] : undefined;
		if (previous === undefined || previous === now) {
			continue;
		}
		const hunk = diffDroxSdtcmText(previous, now);
		const stale: IDroxSdtcmStaleBrick[] = [];
		for (const brick of bricks) {
			const at = lineTrim(now, brick.line);
			if (at === brick.quote.trim()) {
				continue;
			}
			const found = findDroxSdtcmQuote(now, brick.quote);
			if (found === undefined) {
				stale.push({ id: brick.id, line: brick.line, quote: brick.quote, reason: 'gone' });
			} else if (found !== brick.line) {
				stale.push({ id: brick.id, line: brick.line, quote: brick.quote, reason: 'moved', foundLine: found });
			} else {
				stale.push({ id: brick.id, line: brick.line, quote: brick.quote, reason: 'mismatch' });
			}
		}
		if (hunk || stale.length) {
			focus.push({ path, missing: false, hunk, stale });
		}
	}
	return focus;
}

export function formatDroxSdtcmFocus(focus: readonly IDroxSdtcmFocus[]): string {
	return focus.map(item => {
		const stale = item.stale.map(brick => {
			const where = brick.foundLine ? ` found on line ${brick.foundLine}` : '';
			return `- ${brick.id} line ${brick.line} ${brick.reason}${where}: ${brick.quote}`;
		}).join('\n');
		const hunk = item.hunk
			? `gap lines ${item.hunk.startLine}-${item.hunk.endLine}\n${clip(item.hunk.currentExcerpt)}`
			: '';
		const head = item.missing ? `${item.path} missing` : item.path;
		return [head, stale, hunk].filter(part => part.length > 0).join('\n');
	}).join('\n\n');
}

function pushCited(cited: Map<string, Array<{ id: string; line: number; quote: string }>>, path: string, brick: { id: string; line: number; quote: string }): void {
	const list = cited.get(path);
	if (list) {
		list.push(brick);
	} else {
		cited.set(path, [brick]);
	}
}

function lineTrim(text: string, line: number): string | undefined {
	const lines = droxSdtcmLines(text);
	if (line < 1 || line > lines.length) {
		return undefined;
	}
	return lines[line - 1].trim();
}

function clip(text: string): string {
	const lines = droxSdtcmLines(text);
	if (lines.length <= 40) {
		return text;
	}
	return `${lines.slice(0, 40).join('\n')}\n…`;
}
