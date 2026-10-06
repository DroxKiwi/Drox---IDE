/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxRule } from './droxRulesTypes.js';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function unquote(raw: string): string {
	const t = raw.trim();
	if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
		return t.slice(1, -1);
	}
	return t;
}

function parseBool(raw: string): boolean | undefined {
	const t = raw.trim().toLowerCase();
	if (t === 'true' || t === 'yes' || t === '1') {
		return true;
	}
	if (t === 'false' || t === 'no' || t === '0') {
		return false;
	}
	return undefined;
}

/** Split comma-separated globs (VS Code `applyTo` style). */
function splitPatterns(raw: string): string[] {
	return raw
		.split(',')
		.map(s => unquote(s).trim())
		.filter(s => s.length > 0);
}

/**
 * Minimal frontmatter parse for Drox rules.
 * Supports Cursor keys (`alwaysApply`, `globs`) and VS Code (`applyTo`, `description`).
 */
export function parseDroxRuleMarkdown(
	raw: string,
	meta: { readonly id: string; readonly relativePath: string },
): IDroxRule | undefined {
	const trimmed = raw.replace(/^\uFEFF/, '');
	if (!trimmed.trim()) {
		return undefined;
	}
	const m = FRONTMATTER_RE.exec(trimmed);
	let description: string | undefined;
	let alwaysApply = false;
	const applyTo: string[] = [];
	let body: string;

	if (m) {
		const fm = m[1];
		body = m[2].trim();
		for (const line of fm.split(/\r?\n/)) {
			const lineTrim = line.trim();
			if (!lineTrim || lineTrim.startsWith('#')) {
				continue;
			}
			const colon = lineTrim.indexOf(':');
			if (colon <= 0) {
				continue;
			}
			const key = lineTrim.slice(0, colon).trim().toLowerCase();
			const value = lineTrim.slice(colon + 1).trim();
			if (key === 'description' || key === 'name') {
				description = unquote(value) || undefined;
			} else if (key === 'alwaysapply' || key === 'always_apply') {
				const b = parseBool(value);
				if (b !== undefined) {
					alwaysApply = b;
				}
			} else if (key === 'applyto' || key === 'globs' || key === 'paths') {
				applyTo.push(...splitPatterns(value));
			}
		}
	} else {
		body = trimmed.trim();
		// No frontmatter → treat as always-on project rule (DROX.md style).
		alwaysApply = true;
	}

	if (!body) {
		return undefined;
	}

	return {
		id: meta.id,
		relativePath: meta.relativePath,
		description,
		alwaysApply,
		applyTo,
		body,
	};
}

export function isDroxRuleFilename(name: string): boolean {
	const lower = name.toLowerCase();
	return lower.endsWith('.instructions.md') || lower.endsWith('.mdc') || lower.endsWith('.md');
}
