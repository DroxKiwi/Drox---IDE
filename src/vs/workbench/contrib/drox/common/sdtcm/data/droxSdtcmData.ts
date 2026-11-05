/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import {
	droxSdtcmLines,
	IDroxSdtcmData,
	IDroxSdtcmDataStep,
	IDroxSdtcmMap,
	isDroxSdtcmBirth,
	isDroxSdtcmBrickId,
	isDroxSdtcmDataId,
} from '../droxSdtcmMap.js';
import { extractDroxSdtcmJson } from '../droxSdtcmRole.js';

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
	readonly mapIndex?: string;
}): string {
	const bricks = input.map.bricks.filter(brick => brick.file === input.path).map(brick => ({
		id: brick.id, name: brick.name, kind: brick.kind, form: brick.form, line: brick.line, quote: brick.quote,
	}));
	const known = input.map.data.filter(item => item.file !== input.path).map(item => ({ id: item.id, name: item.name, file: item.file }));
	const reads = input.reads.map(file => `READ ${file.path}\n${numberText(file.text)}`).join('\n\n');
	return [
		'MODE data',
		input.hint ? `FEEDBACK\n${input.hint}` : '',
		input.mapIndex?.trim() ? input.mapIndex.trim() : '',
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
	readonly mapIndex?: string;
}): string {
	const born = input.map.data.filter(item => item.file === input.path).map(item => ({
		id: item.id, name: item.name, file: item.file, brick: item.brick, line: item.line, parents: item.parents,
	}));
	const reachable = new Map<string, { id: string; file: string; name: string }>();
	for (const item of input.map.data.filter(entry => entry.file === input.path)) {
		const origin = item.brick ? input.map.bricks.find(brick => brick.id === item.brick) : undefined;
		const files = new Set<string>([item.file, ...(origin?.files ?? [])]);
		for (const brick of input.map.bricks) {
			if (brick.form === 'apply' && brick.name === item.name && files.has(brick.file)) {
				reachable.set(brick.id, { id: brick.id, file: brick.file, name: brick.name });
			}
		}
	}
	const reads = input.reads.map(file => `READ ${file.path}\n${numberText(file.text)}`).join('\n\n');
	return [
		'MODE trace',
		input.hint ? `FEEDBACK\n${input.hint}` : '',
		input.mapIndex?.trim() ? input.mapIndex.trim() : '',
		`DATA ${JSON.stringify(born)}`,
		`BRICKS ${JSON.stringify([...reachable.values()])}`,
		reads,
	].filter(part => part.length > 0).join('\n\n');
}

export function readDroxSdtcmDataDraft(raw: string): { readonly ok: true; readonly data: readonly IDroxSdtcmDataDraft[] } | { readonly ok: false; readonly errors: readonly string[] } {
	const json = extractDroxSdtcmJson(raw);
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
	const json = extractDroxSdtcmJson(raw);
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
	_text: string,
): { readonly ok: true; readonly map: IDroxSdtcmMap } | { readonly ok: false; readonly errors: readonly string[] } {
	const errors: string[] = [];
	const bricks = new Map(map.bricks.filter(brick => brick.file === file).map(brick => [brick.id, brick]));
	const required = [...bricks.values()].filter(brick => brick.form === 'declare' && brick.kind !== 'source');
	const kept = map.data.filter(item => item.file !== file);
	const known = new Set(kept.map(item => item.id));
	const used = new Set(map.data.map(item => item.id));
	const seen = new Set<string>();
	const created: IDroxSdtcmData[] = [];
	drafts.forEach((draft, index) => {
		const where = `data[${index}]`;
		const before = errors.length;
		const brick = draft.brick ? bricks.get(draft.brick) : undefined;
		if (!brick || brick.form !== 'declare' || brick.kind === 'source') {
			return;
		}
		if (seen.has(brick.id)) {
			errors.push(`${where} repeats brick ${brick.id}.`);
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
		if (errors.length !== before) {
			return;
		}
		seen.add(brick.id);
		const id = nextDataId(used);
		known.add(id);
		const step: IDroxSdtcmDataStep = { brick: brick.id, name: brick.name, line: brick.line, quote: brick.quote, span: 1 };
		created.push({ id, name: brick.name, birth: draft.birth, file, brick: brick.id, line: brick.line, quote: brick.quote, parents: [...draft.parents], steps: [step] });
	});
	for (const brick of required) {
		if (!seen.has(brick.id)) {
			errors.push(`missing birth for brick ${brick.id} ${brick.name}.`);
		}
	}
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
	const extra = new Map<string, IDroxSdtcmTraceDraft[]>();
	drafts.forEach((draft, index) => {
		if (!bornHere.has(draft.data)) {
			errors.push(`steps[${index}].data is not a birth of ${file}.`);
			return;
		}
		const list = extra.get(draft.data) ?? [];
		list.push(draft);
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
		for (const draft of added) {
			const next = bricks.get(draft.brick);
			if (!next || next.form !== 'apply' || next.name !== item.name || !texts.has(next.file)) {
				continue;
			}
			const previousId = steps[steps.length - 1]?.brick;
			const previous = previousId ? bricks.get(previousId) : undefined;
			if (!previous || (previous.file !== next.file && !previous.files.includes(next.file))) {
				continue;
			}
			if (steps.some(step => step.brick === next.id && step.line === next.line)) {
				continue;
			}
			steps.push({ brick: next.id, name: next.name, line: next.line, quote: next.quote, span: droxSdtcmRepeatSpan(next.quote) });
		}
		return { ...item, steps };
	});
	if (errors.length) {
		return { ok: false, errors };
	}
	return { ok: true, map: { ...map, data } };
}

function droxSdtcmRepeatSpan(quote: string): 1 | 'repeat' {
	if (/\b(?:for|while)\b/.test(quote) || /\.(?:map|forEach)\s*\(/.test(quote)) {
		return 'repeat';
	}
	return 1;
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
			const shown = typeof item === 'string' ? item.trim() : JSON.stringify(item);
			errors.push(shown
				? `${where}.parents[${index}] must be a data id copied from DATA, like d1. ${shown} is not one. Use [] for introduce.`
				: `${where}.parents[${index}] must be a data id copied from DATA, like d1. Use [] for introduce.`);
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
