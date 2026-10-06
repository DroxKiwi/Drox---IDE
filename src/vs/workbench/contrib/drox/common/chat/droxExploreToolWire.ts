/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

export interface IDroxExploreToolStartWire {
	/** Short UI mission label (≤ ~12 words). */
	readonly exploreTitle: string;
	/** Full brief sent to the Explore sub-agent. */
	readonly exploreDescription: string;
	readonly exploreThoroughness?: string;
}

export interface IDroxExploreToolFinishWire {
	readonly exploreReport?: string;
	readonly exploreError?: string;
	readonly exploreThoroughness?: string;
}

/** Cursor-shaped `toolSpecificData` for Agents chat (`IChatSubagentToolInvocationData`). */
export interface IDroxExploreSubagentToolData {
	readonly kind: 'subagent';
	readonly agentName: 'explore';
	readonly description: string;
	readonly prompt?: string;
	readonly result?: string;
}

export function buildExploreSubagentToolSpecificData(
	start: IDroxExploreToolStartWire,
	finish?: IDroxExploreToolFinishWire,
	liveResult?: string,
): IDroxExploreSubagentToolData {
	const result =
		trimString(liveResult) ||
		trimString(finish?.exploreReport) ||
		trimString(finish?.exploreError);
	return {
		kind: 'subagent',
		agentName: 'explore',
		// Agents title = short mission; nested Prompt section = full brief.
		description: start.exploreTitle,
		prompt: start.exploreDescription,
		result: result || undefined,
	};
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function trimString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

const EXPLORE_TITLE_MAX = 80;

/** Meta / engine-parrot lines the model sometimes dumps into `title` — never show as the UI label. */
function isMetaExploreTitle(text: string): boolean {
	const t = text.trim();
	if (!t) {
		return true;
	}
	if (/ne\s+vois\s+pas\s+ce\s+chat|does\s+not\s+see\s+(this\s+)?chat/i.test(t)) {
		return true;
	}
	if (/tout\s+le\s+contexte\s+est\s+ici|pack\s+(all\s+)?context|isolated\s+context/i.test(t)) {
		return true;
	}
	if (/mission\s+double|very\s+thorough|tr[eè]s\s+approfondie/i.test(t) && t.split(/\s+/).length > 6) {
		return true;
	}
	if (/sub-?agent/i.test(t) && /chat|contexte|context|vois|see/i.test(t)) {
		return true;
	}
	// Headers that are clearly instructions, not a mission name.
	if (/^(contexte|context|rapport\s+attendu|sections?\s+de\s+rapport)\b/i.test(t)) {
		return true;
	}
	return false;
}

function wordCount(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Prefer explicit `title`; else a short concrete line from `description` (skip meta parrot lines). */
export function deriveExploreTitle(title: unknown, description: string): string {
	const explicit = trimString(title);
	if (explicit && !isMetaExploreTitle(explicit) && wordCount(explicit) <= 14) {
		return clampExploreTitle(explicit);
	}

	const fromDescription = pickConcreteTitleFromDescription(description);
	if (fromDescription) {
		return clampExploreTitle(fromDescription);
	}

	if (explicit && !isMetaExploreTitle(explicit)) {
		return clampExploreTitle(explicit);
	}

	return 'Explore';
}

function pickConcreteTitleFromDescription(description: string): string | undefined {
	const lines = description
		.split(/\r?\n/)
		.map(l => l.trim())
		.filter(l => l.length > 0);

	for (const line of lines) {
		const labeled = line.match(/^(?:goal|objectif|mission|title|tâche|tache)\s*[:：—-]\s*(.+)$/i);
		if (labeled) {
			const value = labeled[1].trim();
			if (value && !isMetaExploreTitle(value) && wordCount(value) <= 14) {
				return value;
			}
		}
	}

	for (const line of lines) {
		if (isMetaExploreTitle(line)) {
			continue;
		}
		if (wordCount(line) <= 12 && line.length <= 100) {
			return line;
		}
	}

	const path = description.match(/\b(?:docs|src|packages|crates)\/[\w./-]+/);
	if (path) {
		return `Explore ${path[0]}`;
	}

	return undefined;
}

function clampExploreTitle(raw: string): string {
	const oneLine = raw.replace(/\s+/g, ' ').trim();
	if (oneLine.length <= EXPLORE_TITLE_MAX) {
		return oneLine;
	}
	return `${oneLine.slice(0, EXPLORE_TITLE_MAX - 1).trimEnd()}…`;
}

export function buildExploreToolStartWire(name: string, args: unknown): IDroxExploreToolStartWire | undefined {
	if (name !== 'task') {
		return undefined;
	}
	const a = asRecord(args);
	const description = trimString(a.description);
	if (!description) {
		return undefined;
	}
	const thoroughness = trimString(a.thoroughness);
	return {
		exploreTitle: deriveExploreTitle(a.title, description),
		exploreDescription: description,
		exploreThoroughness: thoroughness || undefined,
	};
}

export function buildExploreToolFinishWire(
	name: string | undefined,
	output: unknown,
	isError: boolean,
): IDroxExploreToolFinishWire | undefined {
	if (name !== 'task') {
		return undefined;
	}
	if (!output || typeof output !== 'object') {
		if (isError) {
			return { exploreError: typeof output === 'string' && output.trim() ? output.trim() : 'Explore failed' };
		}
		return undefined;
	}
	const o = asRecord(output);
	const report = trimString(o.report);
	const thoroughness = trimString(o.thoroughness);
	const error =
		trimString(o.error) ||
		(isError && typeof o.message === 'string' ? o.message.trim() : '') ||
		(isError && !report ? 'Explore failed' : '');
	return {
		exploreReport: report || undefined,
		exploreError: error || undefined,
		exploreThoroughness: thoroughness || undefined,
	};
}
