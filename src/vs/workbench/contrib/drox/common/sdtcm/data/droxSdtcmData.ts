/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import {
	droxSdtcmLineAt,
	droxSdtcmLines,
	droxSdtcmQuoteMatches,
	IDroxSdtcmData,
	IDroxSdtcmDataStep,
	IDroxSdtcmMap,
	isDroxSdtcmBirth,
	isDroxSdtcmBrickId,
	isDroxSdtcmDataId,
} from '../droxSdtcmMap.js';

export interface IDroxSdtcmDataDraft {
	readonly name: string;
	readonly birth: 'introduce' | 'transform';
	readonly brick: string | null;
	readonly line: number;
	readonly quote: string;
	readonly parents: readonly string[];
}

export interface IDroxSdtcmTraceDraft {
	readonly data: string;
	readonly brick: string;
	readonly name: string;
	readonly line: number;
	readonly quote: string;
	readonly span: 1 | 'repeat';
}

export function buildDroxSdtcmDataTurn(input: {
	readonly path: string;
	readonly text: string;
	readonly map: IDroxSdtcmMap;
	readonly reads: readonly { readonly path: string; readonly text: string }[];
	readonly hint?: string;
}): string {
	const bricks = input.map.bricks.filter(brick => brick.file === input.path).map(brick => ({
		id: brick.id, name: brick.name, kind: brick.kind, form: brick.form, line: brick.line, quote: brick.quote,
	}));
	const known = input.map.data.map(item => ({ id: item.id, name: item.name, birth: item.birth, brick: item.brick }));
	const reads = input.reads.map(file => `READ ${file.path}\n${numberText(file.text)}`).join('\n\n');
	return [
		'MODE data',
		'Name the births in FILE. introduce has no parents. transform names data from DATA. A parameter, an alias, or a mutation is not a birth. A file may have none. If the birth line is a brick, set brick. If it is not, omit brick.',
		input.hint ? `FEEDBACK\n${input.hint}` : '',
		`BRICKS ${JSON.stringify(bricks)}`,
		`DATA ${JSON.stringify(known)}`,
		`FILE ${input.path}\n${numberText(input.text)}`,
		reads,
	].filter(part => part.length > 0).join('\n\n');
}

export function buildDroxSdtcmTraceTurn(input: {
	readonly path: string;
	readonly map: IDroxSdtcmMap;
	readonly reads: readonly { readonly path: string; readonly text: string }[];
	readonly hint?: string;
}): string {
	const born = input.map.data.filter(item => item.file === input.path);
	const brickIds = new Set<string>();
	for (const item of born) {
		if (item.brick) {
			brickIds.add(item.brick);
		}
		for (const step of item.steps) {
			if (step.brick) {
				brickIds.add(step.brick);
			}
		}
	}
	const links = input.map.bricks.filter(brick => brickIds.has(brick.id) || brick.links.some(id => brickIds.has(id))).map(brick => ({
		id: brick.id, file: brick.file, links: brick.links,
	}));
	const reads = input.reads.map(file => `READ ${file.path}\n${numberText(file.text)}`).join('\n\n');
	return [
		'MODE trace',
		'Extend each data of FILE. A parameter keeps the same data and may change name. A repeated site is one step with span repeat. Write its body once after it. Do not unroll.',
		input.hint ? `FEEDBACK\n${input.hint}` : '',
		`DATA ${JSON.stringify(born)}`,
		`LINKS ${JSON.stringify(links)}`,
		reads,
	].filter(part => part.length > 0).join('\n\n');
}

export function readDroxSdtcmDataDraft(raw: string): { readonly ok: true; readonly data: readonly IDroxSdtcmDataDraft[] } | { readonly ok: false; readonly errors: readonly string[] } {
	const json = extractJson(raw);
	if (!json) {
		return { ok: false, errors: ['Response has no JSON object. Return { data }.'] };
	}
	if (!Array.isArray(json.data)) {
		return { ok: false, errors: ['data must be an array.'] };
	}
	const data: IDroxSdtcmDataDraft[] = [];
	const errors: string[] = [];
	json.data.forEach((item, index) => readBirth(item, index, data, errors));
	return errors.length ? { ok: false, errors } : { ok: true, data };
}

export function readDroxSdtcmTraceDraft(raw: string): { readonly ok: true; readonly steps: readonly IDroxSdtcmTraceDraft[] } | { readonly ok: false; readonly errors: readonly string[] } {
	const json = extractJson(raw);
	if (!json) {
		return { ok: false, errors: ['Response has no JSON object. Return { steps }.'] };
	}
	if (!Array.isArray(json.steps)) {
		return { ok: false, errors: ['steps must be an array.'] };
	}
	const steps: IDroxSdtcmTraceDraft[] = [];
	const errors: string[] = [];
	json.steps.forEach((item, index) => readTrace(item, index, steps, errors));
	return errors.length ? { ok: false, errors } : { ok: true, steps };
}

export function acceptDroxSdtcmData(
	map: IDroxSdtcmMap,
	file: string,
	drafts: readonly IDroxSdtcmDataDraft[],
	text: string,
): { readonly ok: true; readonly map: IDroxSdtcmMap } | { readonly ok: false; readonly errors: readonly string[] } {
	const errors: string[] = [];
	const bricks = new Map(map.bricks.filter(brick => brick.file === file).map(brick => [brick.id, brick]));
	const kept = map.data.filter(item => item.file !== file);
	const known = new Set(kept.map(item => item.id));
	const used = new Set(map.data.map(item => item.id));
	const seen = new Set<string>();
	const created: IDroxSdtcmData[] = [];
	drafts.forEach((draft, index) => {
		const where = `data[${index}]`;
		const before = errors.length;
		const brick = draft.brick ? bricks.get(draft.brick) : undefined;
		if (draft.brick && !brick) {
			errors.push(`${where}.brick is not a brick of ${file}.`);
		}
		const anchor = snap(where, text, draft.line, draft.quote, draft.name, errors);
		const onLine = anchor ? [...bricks.values()].filter(item => item.line === anchor.line) : [];
		if (anchor && onLine.length && !onLine.some(item => item.id === draft.brick)) {
			errors.push(`${where}.brick must be the brick on line ${anchor.line}.`);
		}
		if (anchor && !onLine.length && draft.brick) {
			errors.push(`${where}.brick must be omitted. Line ${anchor.line} is outside every brick.`);
		}
		const key = anchor ? `${anchor.line}:${draft.name}` : '';
		if (key && seen.has(key)) {
			errors.push(`${where} repeats line ${anchor?.line} name ${draft.name}.`);
		}
		if (draft.birth === 'introduce' && draft.parents.length > 0) {
			errors.push(`${where}.parents must be empty for introduce.`);
		}
		if (draft.birth === 'transform' && draft.parents.length === 0) {
			errors.push(`${where}.parents must name at least one data.`);
		}
		for (const parent of draft.parents) {
			if (!known.has(parent)) {
				errors.push(`${where}.parents cites unknown ${parent}.`);
			}
		}
		if (errors.length !== before || !anchor || (draft.brick && !brick)) {
			return;
		}
		seen.add(key);
		const id = nextDataId(used);
		known.add(id);
		const step: IDroxSdtcmDataStep = { brick: brick?.id ?? null, name: draft.name, line: anchor.line, quote: anchor.quote, span: 1 };
		created.push({ id, name: draft.name, birth: draft.birth, file, brick: brick?.id ?? null, line: anchor.line, quote: anchor.quote, parents: [...draft.parents], steps: [step] });
	});
	if (errors.length) {
		return { ok: false, errors };
	}
	return { ok: true, map: { ...map, data: [...kept, ...created] } };
}

export function acceptDroxSdtcmTrace(
	map: IDroxSdtcmMap,
	file: string,
	drafts: readonly IDroxSdtcmTraceDraft[],
	texts: ReadonlyMap<string, string>,
): { readonly ok: true; readonly map: IDroxSdtcmMap } | { readonly ok: false; readonly errors: readonly string[] } {
	const errors: string[] = [];
	const bricks = new Map(map.bricks.map(brick => [brick.id, brick]));
	const bornHere = new Set(map.data.filter(item => item.file === file).map(item => item.id));
	const extra = new Map<string, IDroxSdtcmDataStep[]>();
	drafts.forEach((draft, index) => {
		const where = `steps[${index}]`;
		if (!bornHere.has(draft.data)) {
			errors.push(`${where}.data is not a birth of ${file}.`);
			return;
		}
		const brick = bricks.get(draft.brick);
		if (!brick) {
			errors.push(`${where}.brick is unknown.`);
			return;
		}
		const text = texts.get(brick.file);
		if (text === undefined) {
			errors.push(`${where}: ${brick.file} was not found.`);
			return;
		}
		const anchor = snap(where, text, draft.line, draft.quote, draft.name, errors);
		if (!anchor) {
			return;
		}
		const list = extra.get(draft.data) ?? [];
		list.push({ brick: brick.id, name: draft.name, line: anchor.line, quote: anchor.quote, span: draft.span });
		extra.set(draft.data, list);
	});
	if (errors.length) {
		return { ok: false, errors };
	}
	const data = map.data.map(item => {
		const added = extra.get(item.id);
		if (!added) {
			return item;
		}
		const steps = [...item.steps];
		for (const step of added) {
			const birth = steps[0];
			if (birth && step.brick === birth.brick && step.line === birth.line && step.name === birth.name) {
				continue;
			}
			const next = step.brick ? bricks.get(step.brick) : undefined;
			if (!next) {
				errors.push(`${item.id} cites an unknown brick.`);
				continue;
			}
			const previousId = steps[steps.length - 1].brick;
			const previous = previousId ? bricks.get(previousId) : undefined;
			if (!previous) {
				if (next.file !== item.file) {
					errors.push(`${item.id} cannot leave ${item.file} before it enters a brick.`);
				} else {
					steps.push(step);
				}
				continue;
			}
			if (previous.file !== next.file && !previous.links.includes(next.id)) {
				errors.push(`${item.id} cannot reach ${next.id} from ${previous.id}.`);
				continue;
			}
			steps.push(step);
		}
		return { ...item, steps };
	});
	if (errors.length) {
		return { ok: false, errors };
	}
	return { ok: true, map: { ...map, data } };
}

function readBirth(item: unknown, index: number, data: IDroxSdtcmDataDraft[], errors: string[]): void {
	const where = `data[${index}]`;
	if (!item || typeof item !== 'object' || Array.isArray(item)) {
		errors.push(`${where} must be an object.`);
		return;
	}
	const record = item as Record<string, unknown>;
	const name = typeof record.name === 'string' ? record.name.trim() : '';
	const brick = record.brick === undefined || record.brick === null ? null : typeof record.brick === 'string' ? record.brick.trim() : '';
	const quote = typeof record.quote === 'string' ? record.quote.trim() : '';
	if (!isDroxSdtcmBirth(record.birth)) {
		errors.push(`${where}.birth must be introduce or transform.`);
	}
	if (!name) {
		errors.push(`${where}.name is required.`);
	}
	if (brick !== null && !isDroxSdtcmBrickId(brick)) {
		errors.push(`${where}.brick must be a brick id, or omitted.`);
	}
	if (typeof record.line !== 'number' || !Number.isInteger(record.line) || record.line < 1) {
		errors.push(`${where}.line must be an integer greater than 0.`);
	}
	if (!quote) {
		errors.push(`${where}.quote must be the line text.`);
	}
	const parents = readParents(record.parents, where, errors);
	if (!isDroxSdtcmBirth(record.birth) || !name || (brick !== null && !isDroxSdtcmBrickId(brick)) || typeof record.line !== 'number' || !quote || !parents) {
		return;
	}
	data.push({ name, birth: record.birth, brick, line: record.line, quote, parents });
}

function readParents(raw: unknown, where: string, errors: string[]): string[] | undefined {
	if (!Array.isArray(raw)) {
		errors.push(`${where}.parents must be an array.`);
		return undefined;
	}
	const parents: string[] = [];
	raw.forEach((item, index) => {
		const id = typeof item === 'string' ? item.trim() : '';
		if (!isDroxSdtcmDataId(id)) {
			errors.push(`${where}.parents[${index}] must be a data id.`);
			return;
		}
		if (!parents.includes(id)) {
			parents.push(id);
		}
	});
	return parents;
}

function readTrace(item: unknown, index: number, steps: IDroxSdtcmTraceDraft[], errors: string[]): void {
	const where = `steps[${index}]`;
	if (!item || typeof item !== 'object' || Array.isArray(item)) {
		errors.push(`${where} must be an object.`);
		return;
	}
	const record = item as Record<string, unknown>;
	const data = typeof record.data === 'string' ? record.data.trim() : '';
	const brick = typeof record.brick === 'string' ? record.brick.trim() : '';
	const name = typeof record.name === 'string' ? record.name.trim() : '';
	const quote = typeof record.quote === 'string' ? record.quote.trim() : '';
	if (!isDroxSdtcmDataId(data)) {
		errors.push(`${where}.data must be a data id.`);
	}
	if (!isDroxSdtcmBrickId(brick)) {
		errors.push(`${where}.brick must be a brick id.`);
	}
	if (!name) {
		errors.push(`${where}.name is required.`);
	}
	if (typeof record.line !== 'number' || !Number.isInteger(record.line) || record.line < 1) {
		errors.push(`${where}.line must be an integer greater than 0.`);
	}
	if (!quote) {
		errors.push(`${where}.quote must be the line text.`);
	}
	if (record.span !== 1 && record.span !== 'repeat') {
		errors.push(`${where}.span must be 1 or "repeat".`);
	}
	if (!isDroxSdtcmDataId(data) || !isDroxSdtcmBrickId(brick) || !name || typeof record.line !== 'number' || !quote || (record.span !== 1 && record.span !== 'repeat')) {
		return;
	}
	steps.push({ data, brick, name, line: record.line, quote, span: record.span });
}

function snap(where: string, text: string, line: number, quote: string, name: string, errors: string[]): { line: number; quote: string } | undefined {
	const before = errors.length;
	let resolved = line;
	if (!droxSdtcmQuoteMatches(text, line, quote)) {
		const found = findLines(text, quote);
		if (found.length === 1) {
			resolved = found[0];
		} else if (found.length > 1) {
			errors.push(`${where}.quote is on lines ${found.join(', ')}.`);
		} else {
			const actual = droxSdtcmLineAt(text, line);
			errors.push(actual === undefined
				? `${where}: line ${line} is missing.`
				: `${where}: line ${line} is: ${actual.trim()}`);
		}
	}
	if (errors.length !== before) {
		return undefined;
	}
	const exact = droxSdtcmLineAt(text, resolved)?.trim() || quote;
	if (!exact.includes(name)) {
		errors.push(`${where}.name ${name} is not on line ${resolved}.`);
		return undefined;
	}
	return { line: resolved, quote: exact };
}

function findLines(text: string, quote: string): number[] {
	const wanted = quote.trim();
	if (!wanted) {
		return [];
	}
	const lines = droxSdtcmLines(text);
	const found: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === wanted) {
			found.push(i + 1);
		}
	}
	return found;
}

function nextDataId(used: Set<string>): string {
	let index = 1;
	while (used.has(`d${index}`)) {
		index++;
	}
	const id = `d${index}`;
	used.add(id);
	return id;
}

function numberText(text: string): string {
	return droxSdtcmLines(text).map((line, index) => `${index + 1}|${line}`).join('\n');
}

function extractJson(raw: string): Record<string, unknown> | undefined {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start < 0 || end <= start) {
		return undefined;
	}
	try {
		const json = JSON.parse(raw.slice(start, end + 1)) as unknown;
		if (!json || typeof json !== 'object' || Array.isArray(json)) {
			return undefined;
		}
		return json as Record<string, unknown>;
	} catch {
		return undefined;
	}
}
