/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DroxSdtcmForm, DroxSdtcmKind, isDroxSdtcmForm, isDroxSdtcmKind } from './droxSdtcmMap.js';

/** Sidebar choices stored with the opened folder. Consistency stays out of this file. */
export interface IDroxSdtcmSavedDisplay {
	readonly kinds: readonly DroxSdtcmKind[];
	readonly forms: readonly DroxSdtcmForm[];
	readonly links: boolean;
	readonly move: boolean;
	readonly focus: readonly string[];
	readonly visibleTags: readonly string[] | undefined;
}

const KINDS: readonly DroxSdtcmKind[] = ['type', 'operation', 'value', 'source'];
const FORMS: readonly DroxSdtcmForm[] = ['declare', 'apply'];

/** Keeps a saved tag only when that tag still exists in the folder. */
export function savedDroxSdtcmDisplay(saved: IDroxSdtcmSavedDisplay, tagNames: readonly string[]): IDroxSdtcmSavedDisplay {
	const known = new Set(tagNames);
	return {
		...saved,
		visibleTags: saved.visibleTags === undefined ? [...tagNames] : saved.visibleTags.filter(name => known.has(name)),
	};
}

export function defaultDroxSdtcmDisplay(tagNames: readonly string[]): IDroxSdtcmSavedDisplay {
	return {
		kinds: KINDS,
		forms: FORMS,
		links: true,
		move: true,
		focus: [],
		visibleTags: [...tagNames],
	};
}

/** Absent file means the defaults. A present `visibleTags` list is kept, including when it is empty. */
export function parseDroxSdtcmDisplay(raw: string): IDroxSdtcmSavedDisplay | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return undefined;
	}
	const record = parsed as Record<string, unknown>;
	return {
		kinds: record.kinds === undefined ? KINDS : list(record.kinds).filter(isDroxSdtcmKind),
		forms: record.forms === undefined ? FORMS : list(record.forms).filter(isDroxSdtcmForm),
		links: record.links === undefined ? true : record.links === true,
		move: record.move === undefined ? true : record.move === true,
		focus: list(record.focus),
		visibleTags: record.visibleTags === undefined ? undefined : list(record.visibleTags),
	};
}

function list(raw: unknown): string[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const values: string[] = [];
	for (const item of raw) {
		if (typeof item !== 'string' || !item || values.includes(item)) {
			continue;
		}
		values.push(item);
	}
	return values;
}
