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
		let anchor = reviewAnchor(where, { file, line: item.line, quote: item.quote, name: item.name }, new Map([[file, text]]), errors);
		if (errors.length === before) {
			const named = hardenDroxSdtcmName(anchor.quote, item.name);
			if (!named.ok) {
				errors.push(`${where}.name ${named.error}`);
			} else {
				anchor = { ...anchor, name: named.name };
			}
		}
		const files: string[] = [];
		for (const link of item.links) {
			const resolved = resolveDroxSdtcmLink(file, link, known);
			if (resolved && droxSdtcmLinkOnLine(anchor.quote, link, resolved) && !files.includes(resolved)) {
				files.push(resolved);
			}
		}
		if (errors.some(error => error.startsWith(`${where}.`) || error.startsWith(`${where}:`))) {
			return;
		}
		const id = nextBrickId(used);
		bricks.push({ ...anchor, id, kind: item.kind, form: item.form, files, links: [], tags: [] });
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
		if (from.file === to.file) {
			errors.push(`${from.id} and ${to.id} are in the same file.`);
			return;
		}
		if (from.kind === 'source' && to.kind === 'source') {
			errors.push(`${from.id} and ${to.id} are both imports.`);
			return;
		}
		const usedInFile = map.bricks.some(brick => brick.file === from.file && droxSdtcmQuoteMentions(brick.quote, to.name));
		if (from.name !== to.name && !usedInFile) {
			errors.push(`${to.name} is not used by ${from.file}.`);
			return;
		}
		if (!from.files.includes(to.file) && from.name !== to.name) {
			errors.push(`${from.id} does not bring ${to.file} and does not share a name with ${to.id}.`);
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
		const quotes = map.bricks.filter(item => item.file === brick.file).map(item => item.quote);
		for (const path of brick.files) {
			const targets = map.bricks.filter(item => item.file === path);
			if (!targets.length || links.some(id => targets.some(item => item.id === id))) {
				continue;
			}
			const same = targets.find(item => item.name === brick.name && !(brick.kind === 'source' && item.kind === 'source'));
			const mentioned = targets.filter(item => quotes.some(quote => droxSdtcmQuoteMentions(quote, item.name)));
			const onLine = mentioned.filter(item => droxSdtcmQuoteMentions(brick.quote, item.name));
			const chosen = same ?? (onLine.length === 1 ? onLine[0] : mentioned.length === 1 ? mentioned[0] : undefined);
			if (chosen) {
				links.push(chosen.id);
			}
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
		'Each pass starts with the system prompt of that pass. A call sends only that prompt, then one user message.',
		'The user message holds the file, the lists for that pass, READ results, and FEEDBACK when the previous JSON was refused. Tags are the last pass.',
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
	const gap = input.mode === 'align' ? formatDroxSdtcmFocus(input.focus.filter(item => item.path === input.path)) : '';
	const reads = input.reads.map(file => `READ ${file.path}\n${numberDroxSdtcmText(file.text)}`).join('\n\n');
	return [
		input.mode === 'align' ? 'MODE realign' : 'MODE build',
		input.note?.trim() ? `NOTE ${input.note.trim()}` : '',
		gap ? `GAP\n${gap}` : '',
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
	readonly files: readonly string[];
	readonly reads: readonly { readonly path: string; readonly text: string }[];
	readonly hint?: string;
}): string {
	const from = input.map.bricks.filter(brick => brick.file === input.file).map(brick => ({
		id: brick.id, name: brick.name, kind: brick.kind, form: brick.form,
	}));
	const names = new Set(from.map(brick => brick.name));
	const namedFiles = new Set(input.map.bricks.filter(brick => brick.file === input.file).flatMap(brick => brick.files));
	const candidates = input.map.bricks.filter(brick => brick.file !== input.file && (names.has(brick.name) || namedFiles.has(brick.file))).map(brick => ({
		id: brick.id, name: brick.name, kind: brick.kind, form: brick.form, file: brick.file,
	}));
	const reads = input.reads.map(file => `READ ${file.path}\n${numberDroxSdtcmText(file.text)}`).join('\n\n');
	return [
		'MODE link',
		input.hint ? `FEEDBACK\n${input.hint}` : '',
		`FILES\n${input.files.slice(0, 120).join('\n')}`,
		`FROM ${JSON.stringify(from)}`,
		`CANDIDATES ${JSON.stringify(candidates)}`,
		reads,
	].filter(part => part.length > 0).join('\n\n');
}

export type DroxSdtcmTagScope = 'folder' | 'file' | 'brick' | 'data';

export interface IDroxSdtcmTag {
	readonly name: string;
	readonly description: string;
	readonly color: string;
	readonly scope: DroxSdtcmTagScope;
}

export interface IDroxSdtcmTagMarkDraft {
	readonly scope: DroxSdtcmTagScope;
	readonly id: string;
	readonly tag: string;
	readonly reason: string;
}

const DROX_SDTCM_TAG_REASON = 30;

export function isDroxSdtcmTagScope(value: unknown): value is DroxSdtcmTagScope {
	return value === 'folder' || value === 'file' || value === 'brick' || value === 'data';
}

const DROX_SDTCM_TAG_NAME = /^[A-Za-z][A-Za-z0-9-]{0,31}$/;
const DROX_SDTCM_TAG_COLOR = /^#[0-9a-fA-F]{6}$/;

export function parseDroxSdtcmTags(raw: string): IDroxSdtcmTag[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) {
		return [];
	}
	const tags: IDroxSdtcmTag[] = [];
	for (const item of parsed) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			continue;
		}
		const record = item as Record<string, unknown>;
		const name = typeof record.name === 'string' ? record.name.trim() : '';
		const description = typeof record.description === 'string' ? record.description.trim() : '';
		const color = typeof record.color === 'string' ? record.color.trim() : '';
		const scope = isDroxSdtcmTagScope(record.scope) ? record.scope : 'brick';
		if (!DROX_SDTCM_TAG_NAME.test(name) || !description || !DROX_SDTCM_TAG_COLOR.test(color) || tags.some(tag => tag.name === name)) {
			continue;
		}
		tags.push({ name, description: description.slice(0, 240), color, scope });
	}
	return tags;
}

export function droxSdtcmTagNameOk(name: string): boolean {
	return DROX_SDTCM_TAG_NAME.test(name);
}

export function buildDroxSdtcmTagTurn(input: {
	readonly map: IDroxSdtcmMap;
	readonly file: string;
	readonly text: string;
	readonly tags: readonly IDroxSdtcmTag[];
	readonly hint?: string;
}): string {
	const tags = input.tags.filter(tag => tag.scope !== 'folder').map(tag => ({
		name: tag.name, description: tag.description, scope: tag.scope,
	}));
	const scopes = new Set(tags.map(tag => tag.scope));
	const bricks = scopes.has('brick') ? input.map.bricks.filter(brick => brick.file === input.file).map(brick => ({
		id: brick.id, name: brick.name, kind: brick.kind, form: brick.form, quote: brick.quote,
	})) : [];
	const data = scopes.has('data') ? input.map.data.filter(item => item.file === input.file).map(item => ({
		id: item.id, name: item.name, birth: item.birth, quote: item.quote,
	})) : [];
	return [
		'MODE tag',
		input.hint ? `FEEDBACK\n${input.hint}` : '',
		`TAGS ${JSON.stringify(tags)}`,
		scopes.has('brick') ? `BRICKS ${JSON.stringify(bricks)}` : '',
		scopes.has('data') ? `DATA ${JSON.stringify(data)}` : '',
		`FILE ${input.file}\n${numberDroxSdtcmText(input.text)}`,
	].filter(part => part.length > 0).join('\n\n');
}

export function buildDroxSdtcmFolderTagTurn(input: {
	readonly folder: string;
	readonly files: readonly string[];
	readonly tags: readonly IDroxSdtcmTag[];
	readonly hint?: string;
}): string {
	const tags = input.tags.filter(tag => tag.scope === 'folder').map(tag => ({
		name: tag.name, description: tag.description, scope: tag.scope,
	}));
	return [
		'MODE tag',
		input.hint ? `FEEDBACK\n${input.hint}` : '',
		`TAGS ${JSON.stringify(tags)}`,
		`FOLDER ${input.folder}`,
		`FILES\n${input.files.join('\n')}`,
	].filter(part => part.length > 0).join('\n\n');
}

export function readDroxSdtcmTagDraft(raw: string): { readonly ok: true; readonly marks: readonly IDroxSdtcmTagMarkDraft[] } | { readonly ok: false; readonly errors: readonly string[] } {
	const json = extractDroxSdtcmJson(raw);
	if (!json) {
		return { ok: false, errors: ['Response has no JSON object. Return { marks }.'] };
	}
	if (!Array.isArray(json.marks)) {
		return { ok: false, errors: ['marks must be an array.'] };
	}
	const marks: IDroxSdtcmTagMarkDraft[] = [];
	const errors: string[] = [];
	json.marks.forEach((item, index) => {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			errors.push(`marks[${index}] must be an object.`);
			return;
		}
		const record = item as Record<string, unknown>;
		if (!isDroxSdtcmTagScope(record.scope)) {
			errors.push(`marks[${index}].scope must be folder, file, brick, or data.`);
			return;
		}
		if (typeof record.tag !== 'string' || !record.tag.trim()) {
			errors.push(`marks[${index}].tag must be a tag name.`);
			return;
		}
		if (typeof record.reason !== 'string') {
			errors.push(`marks[${index}].reason must be a string.`);
			return;
		}
		const id = typeof record.id === 'string' ? record.id.trim() : '';
		marks.push({ scope: record.scope, id, tag: record.tag.trim(), reason: record.reason });
	});
	return errors.length ? { ok: false, errors } : { ok: true, marks };
}

/** Replace the file, brick, and data tags of FILE for the scopes present in the catalog. */
export function acceptDroxSdtcmTags(
	map: IDroxSdtcmMap,
	file: string,
	marks: readonly IDroxSdtcmTagMarkDraft[],
	catalog: readonly IDroxSdtcmTag[],
): { readonly ok: true; readonly map: IDroxSdtcmMap } | { readonly ok: false; readonly errors: readonly string[] } {
	const errors: string[] = [];
	const scopes = new Set(catalog.map(tag => tag.scope));
	const bricks = new Map<string, { name: string; reason: string }[]>();
	const data = new Map<string, { name: string; reason: string }[]>();
	const files: { name: string; reason: string }[] = [];
	marks.forEach((mark, index) => {
		const declared = catalog.find(tag => tag.name === mark.tag);
		if (!declared) {
			errors.push(`marks[${index}] uses an unknown tag ${mark.tag}.`);
			return;
		}
		if (declared.scope !== mark.scope) {
			errors.push(`marks[${index}] uses ${mark.tag} outside its ${declared.scope} scope.`);
			return;
		}
		const reason = mark.reason.trim();
		if (!reason || reason.length > DROX_SDTCM_TAG_REASON) {
			errors.push(`marks[${index}].reason must be 1 to ${DROX_SDTCM_TAG_REASON} characters.`);
			return;
		}
		if (mark.scope === 'folder') {
			errors.push(`marks[${index}] is a folder tag. This turn is the file.`);
			return;
		}
		if (mark.scope === 'file') {
			if (mark.id) {
				errors.push(`marks[${index}] is a file tag and takes no id.`);
				return;
			}
			if (files.some(item => item.name === mark.tag)) {
				errors.push(`marks[${index}] repeats ${mark.tag} on ${file}.`);
				return;
			}
			files.push({ name: mark.tag, reason });
			return;
		}
		if (mark.scope === 'brick') {
			const brick = map.bricks.find(entry => entry.id === mark.id && entry.file === file);
			if (!brick) {
				errors.push(`marks[${index}].id is not a brick of ${file}.`);
				return;
			}
			const list = bricks.get(brick.id) ?? [];
			if (list.some(item => item.name === mark.tag)) {
				errors.push(`marks[${index}] repeats ${mark.tag} on ${brick.id}.`);
				return;
			}
			list.push({ name: mark.tag, reason });
			bricks.set(brick.id, list);
			return;
		}
		const item = map.data.find(entry => entry.id === mark.id && entry.file === file);
		if (!item) {
			errors.push(`marks[${index}].id is not a data born in ${file}.`);
			return;
		}
		const list = data.get(item.id) ?? [];
		if (list.some(entry => entry.name === mark.tag)) {
			errors.push(`marks[${index}] repeats ${mark.tag} on ${item.id}.`);
			return;
		}
		list.push({ name: mark.tag, reason });
		data.set(item.id, list);
	});
	if (errors.length) {
		return { ok: false, errors };
	}
	const placed = (map.placed ?? []).filter(mark => !(scopes.has('file') && mark.scope === 'file' && mark.on === file));
	for (const mark of files) {
		placed.push({ scope: 'file', on: file, name: mark.name, reason: mark.reason });
	}
	return {
		ok: true,
		map: {
			...map,
			bricks: map.bricks.map(brick => brick.file === file && scopes.has('brick') ? { ...brick, tags: bricks.get(brick.id) ?? [] } : brick),
			data: map.data.map(item => item.file === file && scopes.has('data') ? { ...item, tags: data.get(item.id) ?? [] } : item),
			placed,
		},
	};
}

/** Replace the folder tags of one folder. */
export function acceptDroxSdtcmFolderTags(
	map: IDroxSdtcmMap,
	folder: string,
	marks: readonly IDroxSdtcmTagMarkDraft[],
	catalog: readonly IDroxSdtcmTag[],
): { readonly ok: true; readonly map: IDroxSdtcmMap } | { readonly ok: false; readonly errors: readonly string[] } {
	const errors: string[] = [];
	const chosen: { name: string; reason: string }[] = [];
	marks.forEach((mark, index) => {
		const declared = catalog.find(tag => tag.name === mark.tag);
		if (!declared) {
			errors.push(`marks[${index}] uses an unknown tag ${mark.tag}.`);
			return;
		}
		if (mark.scope !== 'folder' || declared.scope !== 'folder') {
			errors.push(`marks[${index}] uses ${mark.tag} outside its folder scope.`);
			return;
		}
		if (mark.id) {
			errors.push(`marks[${index}] is a folder tag and takes no id.`);
			return;
		}
		const reason = mark.reason.trim();
		if (!reason || reason.length > DROX_SDTCM_TAG_REASON) {
			errors.push(`marks[${index}].reason must be 1 to ${DROX_SDTCM_TAG_REASON} characters.`);
			return;
		}
		if (chosen.some(item => item.name === mark.tag)) {
			errors.push(`marks[${index}] repeats ${mark.tag} on ${folder}.`);
			return;
		}
		chosen.push({ name: mark.tag, reason });
	});
	if (errors.length) {
		return { ok: false, errors };
	}
	const placed = (map.placed ?? []).filter(mark => !(mark.scope === 'folder' && mark.on === folder));
	for (const mark of chosen) {
		placed.push({ scope: 'folder', on: folder, name: mark.name, reason: mark.reason });
	}
	return { ok: true, map: { ...map, placed } };
}

/** Files that have a brick the link pass can connect: a shared name, or a named file. */
export function droxSdtcmFilesToLink(map: IDroxSdtcmMap): string[] {
	const names = new Map<string, Set<string>>();
	for (const brick of map.bricks) {
		const files = names.get(brick.name) ?? new Set<string>();
		files.add(brick.file);
		names.set(brick.name, files);
	}
	const files = new Set<string>();
	for (const brick of map.bricks) {
		const shared = (names.get(brick.name)?.size ?? 0) > 1;
		const brought = brick.files.some(path => map.bricks.some(item => item.file === path));
		if (shared || brought) {
			files.add(brick.file);
		}
	}
	return [...files].sort();
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

const DROX_SDTCM_IDENT = '[A-Za-z_][A-Za-z0-9_]*';

/** The line decides the name. A unique shape overwrites it. An import with several bindings must use one of them. */
function hardenDroxSdtcmName(quote: string, name: string): { readonly ok: true; readonly name: string } | { readonly ok: false; readonly error: string } {
	const line = quote.trim();
	const imported = importBindings(line);
	if (imported) {
		if (imported.length === 1) {
			return { ok: true, name: imported[0] };
		}
		if (imported.includes(name)) {
			return { ok: true, name };
		}
		return { ok: false, error: `${name} is not a binding of this import. Use one of: ${imported.join(', ')}.` };
	}
	const introduced = new RegExp(`\\b(?:function|class|struct|interface|type|enum|const|let|var|def)\\s+(${DROX_SDTCM_IDENT})\\b`).exec(line);
	if (introduced) {
		return { ok: true, name: introduced[1] };
	}
	const exported = new RegExp(`^export\\s+default\\s+(${DROX_SDTCM_IDENT})\\b`).exec(line);
	if (exported) {
		return { ok: true, name: exported[1] };
	}
	if (new RegExp(`^${DROX_SDTCM_IDENT}$`).test(name) && new RegExp(`(^|[^A-Za-z0-9_])${name}([^A-Za-z0-9_]|$)`).test(line)) {
		return { ok: true, name };
	}
	return { ok: false, error: `${name} is not an identifier on this line.` };
}

function importBindings(line: string): string[] | undefined {
	const brace = new RegExp(`^import\\s+(?:type\\s+)?(?:(${DROX_SDTCM_IDENT})\\s*,\\s*)?\\{([^}]+)\\}\\s+from\\b`).exec(line);
	if (brace) {
		const names: string[] = [];
		if (brace[1]) {
			names.push(brace[1]);
		}
		for (const part of brace[2].split(',')) {
			const bits = part.trim().split(/\s+as\s+/);
			const local = bits[bits.length - 1]?.trim() ?? '';
			if (new RegExp(`^${DROX_SDTCM_IDENT}$`).test(local) && !names.includes(local)) {
				names.push(local);
			}
		}
		return names;
	}
	const star = new RegExp(`^import\\s+(?:type\\s+)?\\*\\s+as\\s+(${DROX_SDTCM_IDENT})\\s+from\\b`).exec(line);
	if (star) {
		return [star[1]];
	}
	const alone = new RegExp(`^import\\s+(?:type\\s+)?(${DROX_SDTCM_IDENT})\\s+from\\b`).exec(line);
	if (alone) {
		return [alone[1]];
	}
	return undefined;
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

function droxSdtcmQuoteMentions(quote: string, name: string): boolean {
	return new RegExp(`(^|[^A-Za-z0-9_])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Za-z0-9_]|$)`).test(quote);
}

function droxSdtcmLinkOnLine(quote: string, raw: string, resolved: string): boolean {
	if (quote.includes(raw.trim()) || quote.includes(resolved)) {
		return true;
	}
	const base = resolved.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
	return base.length > 0 && droxSdtcmQuoteMentions(quote, base);
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
