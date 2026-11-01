/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { formatDroxSdtcmFocus, IDroxSdtcmFocus } from './droxSdtcmDiff.js';
import {
	droxSdtcmLineAt,
	droxSdtcmQuoteMatches,
	DroxSdtcmForm,
	DroxSdtcmKind,
	IDroxSdtcmBrick,
	IDroxSdtcmEntry,
	IDroxSdtcmMap,
	isDroxSdtcmForm,
	isDroxSdtcmKind,
	normalizeDroxSdtcmPath,
} from './droxSdtcmMap.js';

export const DROX_SDTCM_SYSTEM_PROMPT = `You are the SDTCM role. You do not write code and you do not comment. You answer with one JSON object and nothing around it.

The engine already listed the files. FILE is in the message. Each line starts with its number and a bar. quote is the text after the bar, without the number. name is written on that line.
To read another file, answer {"read":"relative/path"} and nothing else. The next message returns it under READ. Read only paths from the file tree.

When the message says MODE build or MODE realign, answer:
{"file":"relative/path","items":[{"kind":"operation","form":"declare","name":"main","line":1,"quote":"def main():","links":["src/lib.ts"]}]}
items must contain at least one entry. Never leave the file empty.
links lists only a file this line actually names, copied from FILES. Use [] when it names none. Do not list the whole tree. Do not cite FILE itself. A package name is not a link.

When the message says MODE link, FILE is one file. Its file links already exist. Cover every one that points at a file which has a brick. from is the brick that listed the file. to is one brick in that file. Prefer the brick with the same name. Answer:
{"links":[{"from":"b1","to":"b4"}]}

kind:
- type: a named shape. Class, struct, enum, interface, or SQL table.
- operation: a named transformation. Function, method, procedure, macro, or SQL function.
- value: a named holder. Constant, variable, parameter, or column.
- source: a name brought from elsewhere. import, #include, using, or a SQL extension.
form:
- declare: the line that introduces the name.
- apply: the line that constructs, calls, or reads it.

Python "class User" is type/declare, and "User()" is type/apply. C++ "struct Point" is type/declare, "Point p{}" is type/apply, and "#include" is source/declare. SQL "CREATE TABLE users" is type/declare, "INSERT INTO users" is type/apply, and "CREATE FUNCTION" is operation/declare. Skip every other line. A file still needs at least one item.

When the message says MODE data, name the births in FILE. A birth is a new name. introduce has no parents. transform names data from DATA. A parameter, an alias, or a mutation is not a birth. A file may have none. Answer:
{"data":[{"name":"user","birth":"introduce","brick":"b3","line":12,"quote":"const user = new User()","parents":[]},{"name":"token","birth":"introduce","line":4,"quote":"const token = read()","parents":[]}]}
If the birth line is a brick, set brick to that brick id. The data is drawn inside the brick. If the birth line is not a brick, omit brick. The data is drawn inside the file. quote is that line. name is on that line. One birth per line and name.

When the message says MODE trace, the births already exist. Extend each data of FILE along the brick links. A parameter keeps the same data and may change name. A repeated site is one step with span repeat. Write its body once after it. Do not unroll. Answer:
{"steps":[{"data":"d1","brick":"b8","name":"account","line":3,"quote":"function save(account)","span":1}]}
span is 1 or "repeat". brick is the birth brick or a brick linked from the previous step.

kind is type, operation, value, or source.
form is declare or apply.
file is the path you were given. Do not add another file.
line is an integer. quote is that exact line, with no line number in the text.
name is the declared or used name.
If the message contains FEEDBACK, those are the errors in the previous JSON. Return the corrected JSON.`;

export interface IDroxSdtcmFileItem {
	readonly kind: DroxSdtcmKind;
	readonly form: DroxSdtcmForm;
	readonly name: string;
	readonly line: number;
	readonly quote: string;
	readonly links: readonly string[];
}

export function readDroxSdtcmFileDraft(
	raw: string,
	expectedFile: string,
): { readonly ok: true; readonly file: string; readonly items: readonly IDroxSdtcmFileItem[] } | { readonly ok: false; readonly errors: readonly string[] } {
	const json = extractDroxSdtcmJson(raw);
	if (!json) {
		return { ok: false, errors: ['Response has no JSON object. Return { file, items }.'] };
	}
	const errors: string[] = [];
	const file = typeof json.file === 'string' ? normalizeDroxSdtcmPath(json.file) : undefined;
	if (!file) {
		errors.push('file must be the relative path you were given.');
	} else if (file !== expectedFile) {
		errors.push(`file must be ${expectedFile}.`);
	}
	const items = readItems(json.items, errors);
	if (!errors.length && items.length === 0) {
		errors.push('items must contain at least one entry.');
	}
	if (errors.length || !file) {
		return { ok: false, errors: errors.length ? errors : ['Unreadable file JSON.'] };
	}
	return { ok: true, file, items };
}

export function readDroxSdtcmRead(raw: string): { readonly ok: true; readonly path: string } | { readonly ok: false; readonly error: string } | undefined {
	const json = extractDroxSdtcmJson(raw);
	if (!json || !Object.hasOwn(json, 'read') || json.items !== undefined) {
		return undefined;
	}
	const path = typeof json.read === 'string' ? normalizeDroxSdtcmPath(json.read) : undefined;
	if (!path) {
		return { ok: false, error: 'read must be a relative path from the file tree.' };
	}
	return { ok: true, path };
}

export function acceptDroxSdtcmFile(
	previous: IDroxSdtcmMap,
	file: string,
	items: readonly IDroxSdtcmFileItem[],
	text: string,
	known: ReadonlySet<string>,
): { readonly ok: true; readonly map: IDroxSdtcmMap } | { readonly ok: false; readonly errors: readonly string[] } {
	const errors: string[] = [];
	const used = new Set(previous.bricks.filter(brick => brick.file !== file).map(brick => brick.id));
	const bricks: IDroxSdtcmBrick[] = [];
	items.forEach((item, index) => {
		const where = `items[${index}]`;
		const before = errors.length;
		const anchor = reviewAnchor(where, { file, line: item.line, quote: item.quote, name: item.name }, new Map([[file, text]]), errors);
		if (errors.length === before && !anchor.quote.includes(item.name)) {
			errors.push(`${where}.name ${item.name} is not on line ${anchor.line}.`);
		}
		const files: string[] = [];
		for (const link of item.links) {
			const resolved = resolveDroxSdtcmLink(file, link, known);
			if (resolved && !files.includes(resolved)) {
				files.push(resolved);
			}
		}
		if (errors.some(error => error.startsWith(`${where}.`) || error.startsWith(`${where}:`))) {
			return;
		}
		const id = nextBrickId(used);
		bricks.push({ ...anchor, id, kind: item.kind, form: item.form, files, links: [] });
	});
	if (errors.length) {
		return { ok: false, errors };
	}
	const kept = previous.bricks.filter(brick => brick.file !== file);
	const alive = new Set([...kept, ...bricks].map(brick => brick.id));
	return { ok: true, map: { version: 1, entry: null, bricks: [...kept, ...bricks], data: previous.data.filter(item => item.file !== file && (!item.brick || alive.has(item.brick))) } };
}

export function readDroxSdtcmLinkDraft(raw: string): { readonly ok: true; readonly links: readonly { readonly from: string; readonly to: string }[] } | { readonly ok: false; readonly errors: readonly string[] } {
	const json = extractDroxSdtcmJson(raw);
	if (!json) {
		return { ok: false, errors: ['Response has no JSON object. Return { links }.'] };
	}
	if (!Array.isArray(json.links)) {
		return { ok: false, errors: ['links must be an array.'] };
	}
	const links: { from: string; to: string }[] = [];
	const errors: string[] = [];
	json.links.forEach((item, index) => {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			errors.push(`links[${index}] must be an object.`);
			return;
		}
		const record = item as Record<string, unknown>;
		const from = typeof record.from === 'string' ? record.from.trim() : '';
		const to = typeof record.to === 'string' ? record.to.trim() : '';
		if (!from || !to) {
			errors.push(`links[${index}] needs from and to.`);
			return;
		}
		links.push({ from, to });
	});
	if (errors.length) {
		return { ok: false, errors };
	}
	return { ok: true, links };
}

export function acceptDroxSdtcmLinks(
	map: IDroxSdtcmMap,
	pairs: readonly { readonly from: string; readonly to: string }[],
	file?: string,
): { readonly ok: true; readonly map: IDroxSdtcmMap } | { readonly ok: false; readonly errors: readonly string[]; readonly map: IDroxSdtcmMap } {
	const byId = new Map(map.bricks.map(brick => [brick.id, brick]));
	const errors: string[] = [];
	const grouped = new Map<string, string[]>();
	pairs.forEach((pair, index) => {
		const from = byId.get(pair.from);
		const to = byId.get(pair.to);
		if (!from || !to) {
			errors.push(`links[${index}] cites an unknown brick.`);
			return;
		}
		if (file && from.file !== file) {
			errors.push(`${from.id} is not in ${file}.`);
			return;
		}
		if (!from.files.includes(to.file)) {
			errors.push(`${from.id} has no file link to ${to.file}.`);
			return;
		}
		const list = grouped.get(from.id) ?? [];
		if (!list.includes(to.id)) {
			list.push(to.id);
			grouped.set(from.id, list);
		}
	});
	const merged = mergeDroxSdtcmLinks(map, grouped, file);
	const scope = map.bricks.filter(brick => !file || brick.file === file);
	for (const brick of scope) {
		for (const path of brick.files) {
			if (!map.bricks.some(item => item.file === path)) {
				continue;
			}
			const chosen = grouped.get(brick.id) ?? [];
			if (!chosen.some(id => byId.get(id)?.file === path)) {
				errors.push(`${brick.id} still has no brick link for ${path}.`);
			}
		}
	}
	if (errors.length) {
		return { ok: false, errors, map: merged };
	}
	return { ok: true, map: merged };
}

/** One brick per file link that the model left open. Same name first, otherwise the first brick of that file. */
export function completeDroxSdtcmLinks(map: IDroxSdtcmMap, file: string): IDroxSdtcmMap {
	const bricks = map.bricks.map(brick => {
		if (brick.file !== file) {
			return brick;
		}
		const links = [...brick.links];
		for (const path of brick.files) {
			const targets = map.bricks.filter(item => item.file === path);
			if (!targets.length || links.some(id => targets.some(item => item.id === id))) {
				continue;
			}
			const named = targets.find(item => item.name === brick.name);
			links.push((named ?? targets[0]).id);
		}
		return { ...brick, links };
	});
	return { ...map, bricks };
}

function mergeDroxSdtcmLinks(map: IDroxSdtcmMap, grouped: ReadonlyMap<string, string[]>, file: string | undefined): IDroxSdtcmMap {
	return {
		...map,
		bricks: map.bricks.map(brick => {
			if (file && brick.file !== file) {
				return brick;
			}
			return { ...brick, links: grouped.get(brick.id) ?? [] };
		}),
	};
}

export function droxSdtcmMapFiles(map: IDroxSdtcmMap): string[] {
	const files = new Set<string>();
	if (map.entry) {
		files.add(map.entry.file);
	}
	for (const brick of map.bricks) {
		files.add(brick.file);
	}
	return [...files];
}

export function formatDroxSdtcmDiscussion(exchanges: readonly { readonly role: 'engine' | 'agent'; readonly text: string }[]): string {
	const lines = [
		'SDTCM discussion',
		'The system prompt is the first ENGINE message. It is sent again on every model call.',
		'Each later ENGINE message includes FILE with numbered lines, the READ tool results, and FEEDBACK when the previous JSON was refused. Later turns ask for brick-to-brick links, then data births, then the trace of each birth.',
		'',
	];
	exchanges.forEach((item, index) => {
		lines.push(`--- ${index + 1}. ${item.role === 'engine' ? 'ENGINE' : 'AGENT'} ---`, item.text, '');
	});
	return lines.join('\n');
}

export function buildDroxSdtcmTurn(input: {
	readonly mode: 'build' | 'align';
	readonly path: string;
	readonly files: readonly string[];
	readonly text: string;
	readonly reads: readonly { readonly path: string; readonly text: string }[];
	readonly focus: readonly IDroxSdtcmFocus[];
	readonly note?: string;
	readonly hint?: string;
}): string {
	const focus = input.mode === 'align'
		? `Rewrite the items of FILE. The diff is SDTCM's, not git.\n${formatDroxSdtcmFocus(input.focus.filter(item => item.path === input.path)) || 'no gap'}`
		: 'Record at least one item. links lists only a file this line actually names. Use [] when it names none.';
	const reads = input.reads.map(file => `READ ${file.path}\n${numberDroxSdtcmText(file.text)}`).join('\n\n');
	return [
		input.mode === 'align' ? 'MODE realign' : 'MODE build',
		input.note?.trim() ? `NOTE ${input.note.trim()}` : '',
		focus,
		input.hint ? `FEEDBACK\n${input.hint}` : '',
		`FILES\n${input.files.slice(0, 120).join('\n')}`,
		`FILE ${input.path}\n${numberDroxSdtcmText(input.text)}`,
		reads,
	].filter(part => part.length > 0).join('\n\n');
}

export function droxSdtcmLinkFiles(map: IDroxSdtcmMap): string[] {
	const known = new Set(map.bricks.map(brick => brick.file));
	const files = new Set<string>();
	for (const brick of map.bricks) {
		if (brick.files.some(path => known.has(path))) {
			files.add(brick.file);
		}
	}
	return [...files].sort();
}

export function buildDroxSdtcmLinkTurn(input: {
	readonly map: IDroxSdtcmMap;
	readonly file: string;
	readonly reads: readonly { readonly path: string; readonly text: string }[];
	readonly hint?: string;
}): string {
	const known = new Set(input.map.bricks.map(brick => brick.file));
	const from = input.map.bricks.filter(brick => brick.file === input.file && brick.files.some(path => known.has(path))).map(brick => ({
		id: brick.id, name: brick.name, files: brick.files.filter(path => known.has(path)),
	}));
	const targets = new Set(from.flatMap(brick => brick.files));
	const to = input.map.bricks.filter(brick => targets.has(brick.file)).map(brick => ({
		id: brick.id, name: brick.name, file: brick.file,
	}));
	const reads = input.reads.map(file => `READ ${file.path}\n${numberDroxSdtcmText(file.text)}`).join('\n\n');
	return [
		'MODE link',
		`Cover every file link of ${input.file}. from listed the file. to is one brick in that file. Prefer the brick with the same name.`,
		input.hint ? `FEEDBACK\n${input.hint}` : '',
		`FROM ${JSON.stringify(from)}`,
		`TO ${JSON.stringify(to)}`,
		reads,
	].filter(part => part.length > 0).join('\n\n');
}

function readItems(raw: unknown, errors: string[]): IDroxSdtcmFileItem[] {
	if (!Array.isArray(raw)) {
		errors.push('items must be an array.');
		return [];
	}
	const items: IDroxSdtcmFileItem[] = [];
	raw.forEach((item, index) => {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			errors.push(`items[${index}] must be an object.`);
			return;
		}
		const record = item as Record<string, unknown>;
		const where = `items[${index}]`;
		if (!isDroxSdtcmKind(record.kind)) {
			errors.push(`${where}.kind must be type, operation, value, or source.`);
		}
		if (!isDroxSdtcmForm(record.form)) {
			errors.push(`${where}.form must be declare or apply.`);
		}
		if (typeof record.line !== 'number' || !Number.isInteger(record.line) || record.line < 1) {
			errors.push(`${where}.line must be an integer greater than 0.`);
		}
		const quote = typeof record.quote === 'string' ? record.quote.trim() : '';
		if (!quote) {
			errors.push(`${where}.quote must be the line text.`);
		}
		const name = typeof record.name === 'string' ? record.name.trim() : '';
		if (!name) {
			errors.push(`${where}.name is required.`);
		}
		const links = readFileLinks(record.links, where, errors);
		if (isDroxSdtcmKind(record.kind) && isDroxSdtcmForm(record.form) && typeof record.line === 'number' && quote && name && links) {
			items.push({ kind: record.kind, form: record.form, name, line: record.line, quote, links });
		}
	});
	return items;
}

function readFileLinks(raw: unknown, where: string, errors: string[]): string[] | undefined {
	if (!Array.isArray(raw)) {
		errors.push(`${where}.links must be an array of file paths.`);
		return undefined;
	}
	const links: string[] = [];
	raw.forEach((item, index) => {
		const path = typeof item === 'string' ? item.trim().replace(/\\/g, '/') : '';
		if (!path || path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
			errors.push(`${where}.links[${index}] must be a relative path.`);
			return;
		}
		if (!links.includes(path)) {
			links.push(path);
		}
	});
	return links;
}

function nextBrickId(used: Set<string>): string {
	let index = 1;
	while (used.has(`b${index}`)) {
		index++;
	}
	const id = `b${index}`;
	used.add(id);
	return id;
}

function reviewAnchor(where: string, anchor: IDroxSdtcmEntry, files: ReadonlyMap<string, string>, errors: string[]): IDroxSdtcmEntry {
	const text = files.get(anchor.file);
	if (text === undefined) {
		errors.push(`${where}: ${anchor.file} was not found.`);
		return anchor;
	}
	if (droxSdtcmQuoteMatches(text, anchor.line, anchor.quote)) {
		return { ...anchor, quote: droxSdtcmLineAt(text, anchor.line)?.trim() || anchor.quote };
	}
	const found = findDroxSdtcmQuoteLines(text, anchor.quote);
	if (found.length === 1) {
		const line = found[0];
		return { ...anchor, line, quote: droxSdtcmLineAt(text, line)?.trim() || anchor.quote };
	}
	if (found.length > 1) {
		errors.push(`${where}.quote is on lines ${found.join(', ')}.`);
		return anchor;
	}
	const actual = droxSdtcmLineAt(text, anchor.line);
	errors.push(actual === undefined
		? `${where}: line ${anchor.line} is missing from ${anchor.file}.`
		: `${where}: line ${anchor.line} of ${anchor.file} is: ${actual.trim()}`);
	return anchor;
}

function extractDroxSdtcmJson(raw: string): Record<string, unknown> | undefined {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start < 0 || end <= start) {
		return undefined;
	}
	const slice = raw.slice(start, end + 1);
	const json = parseDroxSdtcmJson(slice) ?? parseDroxSdtcmJson(slice.replace(/,\s*([}\]])/g, '$1'));
	return json && typeof json === 'object' && !Array.isArray(json) ? json as Record<string, unknown> : undefined;
}

function parseDroxSdtcmJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}

function numberDroxSdtcmText(text: string): string {
	const lines = text.split(/\r?\n/);
	const body = lines.length > 1 && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
	return clip(body.map((line, index) => `${index + 1}|${line}`).join('\n'));
}

function resolveDroxSdtcmLink(fromFile: string, raw: string, known: ReadonlySet<string>): string | undefined {
	const direct = normalizeDroxSdtcmPath(raw);
	if (direct && direct !== fromFile && known.has(direct)) {
		return direct;
	}
	const stack = fromFile.split('/').slice(0, -1);
	for (const part of raw.trim().replace(/\\/g, '/').split('/')) {
		if (!part || part === '.') {
			continue;
		}
		if (part === '..') {
			if (!stack.length) {
				return undefined;
			}
			stack.pop();
			continue;
		}
		stack.push(part);
	}
	const joined = stack.join('/');
	if (!joined || joined === fromFile) {
		return undefined;
	}
	if (known.has(joined)) {
		return joined;
	}
	const matches = [...known].filter(path => path.startsWith(`${joined}.`) && !path.slice(joined.length + 1).includes('/'));
	return matches.length === 1 ? matches[0] : undefined;
}

function findDroxSdtcmQuoteLines(text: string, quote: string): number[] {
	const wanted = quote.trim();
	if (!wanted) {
		return [];
	}
	const lines = text.split(/\r?\n/);
	const found: number[] = [];
	for (let index = 0; index < lines.length; index++) {
		if (lines[index].trim() === wanted) {
			found.push(index + 1);
		}
	}
	return found;
}

function clip(text: string): string {
	if (text.length <= 12000) {
		return text;
	}
	return `${text.slice(0, 12000)}\n…`;
}
