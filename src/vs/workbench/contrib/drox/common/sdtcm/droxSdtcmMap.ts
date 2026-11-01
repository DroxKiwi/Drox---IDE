/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

export const DROX_SDTCM_MAP_VERSION = 1;

export interface IDroxSdtcmEntry {
	readonly file: string;
	readonly line: number;
	readonly quote: string;
	readonly name: string;
}

export type DroxSdtcmKind = 'type' | 'operation' | 'value' | 'source';
export type DroxSdtcmForm = 'declare' | 'apply';
export type DroxSdtcmBirth = 'introduce' | 'transform';
export type DroxSdtcmSpan = 1 | 'repeat';

export interface IDroxSdtcmDataStep {
	readonly brick: string | null;
	readonly name: string;
	readonly line: number;
	readonly quote: string;
	readonly span: DroxSdtcmSpan;
}

export interface IDroxSdtcmData {
	readonly id: string;
	readonly name: string;
	readonly birth: DroxSdtcmBirth;
	readonly file: string;
	/** Set when the birth line is a brick. Null when the birth sits in the file. */
	readonly brick: string | null;
	readonly line: number;
	readonly quote: string;
	readonly parents: readonly string[];
	readonly steps: readonly IDroxSdtcmDataStep[];
}

export interface IDroxSdtcmBrick {
	readonly id: string;
	readonly file: string;
	readonly line: number;
	readonly quote: string;
	readonly name: string;
	readonly kind: DroxSdtcmKind;
	readonly form: DroxSdtcmForm;
	/** Other files this brick connects to. */
	readonly files: readonly string[];
	/** Brick ids chosen for those files. */
	readonly links: readonly string[];
}

export interface IDroxSdtcmMap {
	readonly version: 1;
	readonly entry: IDroxSdtcmEntry | null;
	readonly bricks: readonly IDroxSdtcmBrick[];
	readonly data: readonly IDroxSdtcmData[];
}

export interface IDroxSdtcmBaseline {
	readonly version: 1;
	readonly files: Readonly<Record<string, string>>;
}

export function emptyDroxSdtcmMap(): IDroxSdtcmMap {
	return { version: DROX_SDTCM_MAP_VERSION, entry: null, bricks: [], data: [] };
}

export function emptyDroxSdtcmBaseline(): IDroxSdtcmBaseline {
	return { version: DROX_SDTCM_MAP_VERSION, files: {} };
}

/** Workspace-relative posix path. Rejects absolutes and parent segments. */
export function normalizeDroxSdtcmPath(raw: string): string | undefined {
	const path = raw.trim().replace(/\\/g, '/').replace(/^\.\//, '');
	if (!path || path.startsWith('/') || path.split('/').some(part => part === '..' || part === '')) {
		return undefined;
	}
	return path;
}

export function droxSdtcmLines(text: string): string[] {
	return text.split(/\r?\n/);
}

export function droxSdtcmLineAt(text: string, line: number): string | undefined {
	const lines = droxSdtcmLines(text);
	if (!Number.isInteger(line) || line < 1 || line > lines.length) {
		return undefined;
	}
	return lines[line - 1];
}

export function droxSdtcmQuoteMatches(text: string, line: number, quote: string): boolean {
	const got = droxSdtcmLineAt(text, line);
	return got !== undefined && got.trim() === quote.trim();
}

export function findDroxSdtcmQuote(text: string, quote: string): number | undefined {
	const wanted = quote.trim();
	if (!wanted) {
		return undefined;
	}
	const lines = droxSdtcmLines(text);
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim() === wanted) {
			return i + 1;
		}
	}
	return undefined;
}

export interface IDroxSdtcmRow {
	readonly depth: number;
	readonly id: string;
	readonly name: string;
	readonly file: string;
	readonly line: number;
	readonly role: string;
}

export function droxSdtcmBrickLabel(brick: { readonly kind: DroxSdtcmKind; readonly form: DroxSdtcmForm }): string {
	const kind = brick.kind;
	const form = brick.form;
	return `${kind} · ${form}`;
}

export function listDroxSdtcmRows(map: IDroxSdtcmMap): IDroxSdtcmRow[] {
	return map.bricks.map(brick => ({
		depth: 1,
		id: brick.id,
		name: brick.name,
		file: brick.file,
		line: brick.line,
		role: droxSdtcmBrickLabel(brick),
	}));
}

export function parseDroxSdtcmMap(raw: string): IDroxSdtcmMap {
	try {
		const json = JSON.parse(raw) as Partial<IDroxSdtcmMap>;
		if (json.version !== DROX_SDTCM_MAP_VERSION || !Array.isArray(json.bricks)) {
			return emptyDroxSdtcmMap();
		}
		const bricks: IDroxSdtcmBrick[] = [];
		for (const brick of json.bricks) {
			const normalized = normalizeBrick(brick);
			if (normalized) {
				bricks.push(normalized);
			}
		}
		const brickFile = new Map(bricks.map(brick => [brick.id, brick.file]));
		const data: IDroxSdtcmData[] = [];
		if (Array.isArray(json.data)) {
			for (const item of json.data) {
				const normalized = normalizeData(item, brickFile);
				if (normalized) {
					data.push(normalized);
				}
			}
		}
		return { version: 1, entry: normalizeEntry(json.entry), bricks, data };
	} catch {
		return emptyDroxSdtcmMap();
	}
}

export function parseDroxSdtcmBaseline(raw: string): IDroxSdtcmBaseline {
	try {
		const json = JSON.parse(raw) as { version?: number; files?: Record<string, unknown> };
		if (json.version !== DROX_SDTCM_MAP_VERSION || !json.files) {
			return emptyDroxSdtcmBaseline();
		}
		const files: Record<string, string> = {};
		for (const [path, text] of Object.entries(json.files)) {
			const normalized = normalizeDroxSdtcmPath(path);
			if (normalized && typeof text === 'string') {
				files[normalized] = text;
			}
		}
		return { version: 1, files };
	} catch {
		return emptyDroxSdtcmBaseline();
	}
}

function normalizeEntry(raw: unknown): IDroxSdtcmEntry | null {
	if (!raw || typeof raw !== 'object') {
		return null;
	}
	const entry = raw as IDroxSdtcmEntry;
	const file = typeof entry.file === 'string' ? normalizeDroxSdtcmPath(entry.file) : undefined;
	if (!file || !Number.isInteger(entry.line) || entry.line < 1) {
		return null;
	}
	if (typeof entry.quote !== 'string' || typeof entry.name !== 'string' || !entry.name.trim()) {
		return null;
	}
	return { file, line: entry.line, quote: entry.quote, name: entry.name.trim() };
}

function normalizeBrick(raw: unknown): IDroxSdtcmBrick | undefined {
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	const brick = raw as IDroxSdtcmBrick;
	const file = typeof brick.file === 'string' ? normalizeDroxSdtcmPath(brick.file) : undefined;
	if (!file || typeof brick.id !== 'string' || !isDroxSdtcmBrickId(brick.id)) {
		return undefined;
	}
	if (!isDroxSdtcmKind(brick.kind) || !isDroxSdtcmForm(brick.form)) {
		return undefined;
	}
	if (!Number.isInteger(brick.line) || brick.line < 1 || typeof brick.quote !== 'string' || typeof brick.name !== 'string') {
		return undefined;
	}
	const files = normalizeDroxSdtcmPathList(brick.files);
	const links = normalizeDroxSdtcmIdList(brick.links);
	if (!files || !links) {
		return undefined;
	}
	return { id: brick.id, file, line: brick.line, quote: brick.quote, name: brick.name.trim(), kind: brick.kind, form: brick.form, files, links };
}

function normalizeDroxSdtcmPathList(raw: unknown): string[] | undefined {
	if (!Array.isArray(raw)) {
		return undefined;
	}
	const paths: string[] = [];
	for (const item of raw) {
		const path = typeof item === 'string' ? normalizeDroxSdtcmPath(item) : undefined;
		if (!path || paths.includes(path)) {
			continue;
		}
		paths.push(path);
	}
	return paths;
}

function normalizeDroxSdtcmIdList(raw: unknown): string[] | undefined {
	if (!Array.isArray(raw)) {
		return undefined;
	}
	const ids: string[] = [];
	for (const item of raw) {
		if (typeof item !== 'string' || !isDroxSdtcmBrickId(item) || ids.includes(item)) {
			continue;
		}
		ids.push(item);
	}
	return ids;
}

export function isDroxSdtcmKind(value: unknown): value is DroxSdtcmKind {
	return value === 'type' || value === 'operation' || value === 'value' || value === 'source';
}

export function isDroxSdtcmForm(value: unknown): value is DroxSdtcmForm {
	return value === 'declare' || value === 'apply';
}

export function isDroxSdtcmBrickId(id: string): boolean {
	return /^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(id) && id !== 'entry';
}

export function isDroxSdtcmDataId(id: string): boolean {
	return /^d[1-9][0-9]*$/.test(id);
}

export function isDroxSdtcmBirth(value: unknown): value is DroxSdtcmBirth {
	return value === 'introduce' || value === 'transform';
}

function normalizeData(raw: unknown, brickFile: ReadonlyMap<string, string>): IDroxSdtcmData | undefined {
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	const data = raw as IDroxSdtcmData;
	const brick = data.brick === null || data.brick === undefined ? null : data.brick;
	if (typeof data.id !== 'string' || !isDroxSdtcmDataId(data.id) || (brick !== null && (typeof brick !== 'string' || !isDroxSdtcmBrickId(brick)))) {
		return undefined;
	}
	const file = typeof data.file === 'string' && normalizeDroxSdtcmPath(data.file)
		? normalizeDroxSdtcmPath(data.file)
		: brick ? brickFile.get(brick) : undefined;
	if (!file || !isDroxSdtcmBirth(data.birth) || !Number.isInteger(data.line) || data.line < 1) {
		return undefined;
	}
	if (typeof data.quote !== 'string' || typeof data.name !== 'string' || !data.name.trim()) {
		return undefined;
	}
	if (!Array.isArray(data.parents) || data.parents.some(id => typeof id !== 'string' || !isDroxSdtcmDataId(id))) {
		return undefined;
	}
	if (!Array.isArray(data.steps)) {
		return undefined;
	}
	const steps: IDroxSdtcmDataStep[] = [];
	for (const step of data.steps) {
		const normalized = normalizeStep(step);
		if (!normalized) {
			return undefined;
		}
		steps.push(normalized);
	}
	return {
		id: data.id,
		name: data.name.trim(),
		birth: data.birth,
		file,
		brick,
		line: data.line,
		quote: data.quote,
		parents: [...data.parents],
		steps,
	};
}

function normalizeStep(raw: unknown): IDroxSdtcmDataStep | undefined {
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	const step = raw as IDroxSdtcmDataStep;
	const brick = step.brick === null ? null : step.brick;
	if ((brick !== null && (typeof brick !== 'string' || !isDroxSdtcmBrickId(brick))) || typeof step.name !== 'string' || !step.name.trim()) {
		return undefined;
	}
	if (!Number.isInteger(step.line) || step.line < 1 || typeof step.quote !== 'string') {
		return undefined;
	}
	if (step.span !== 1 && step.span !== 'repeat') {
		return undefined;
	}
	return { brick, name: step.name.trim(), line: step.line, quote: step.quote, span: step.span };
}
