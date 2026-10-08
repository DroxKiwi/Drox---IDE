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
	/** Sub-agent type (V1: `explore`). */
	readonly exploreSubagentType?: string;
	/** Typed return kinds requested by the parent (`paths_read`, …). */
	readonly exploreReturnKinds?: readonly string[];
}

export interface IDroxExploreToolFinishWire {
	readonly exploreReport?: string;
	readonly exploreReportPath?: string;
	readonly exploreError?: string;
	readonly exploreThoroughness?: string;
	readonly exploreSubagentType?: string;
	readonly exploreReturnKinds?: readonly string[];
	readonly exploreId?: string;
	readonly exploreKindsIncomplete?: readonly string[];
}

/** Cursor-shaped `toolSpecificData` for Agents chat (`IChatSubagentToolInvocationData`). */
export interface IDroxExploreSubagentToolData {
	readonly kind: 'subagent';
	readonly agentName: 'explore';
	readonly description: string;
	readonly prompt?: string;
	readonly result?: string;
	/** Workspace-relative path to `.drox/subagents/…/conclusion.md`. */
	readonly resultPath?: string;
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
	const resultPath = trimString(finish?.exploreReportPath) || undefined;
	return {
		kind: 'subagent',
		agentName: 'explore',
		// Agents title = short mission; nested Prompt section = full brief.
		description: start.exploreTitle,
		prompt: start.exploreDescription,
		result: result || undefined,
		resultPath,
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

const KNOWN_RETURN_KINDS = new Set([
	'paths_read',
	'file_summaries',
	'key_symbols',
	'code_snippets',
	'structure_map',
	'gaps',
]);

/** Normalize `return_kinds` / `returnKinds` from tool args or finish output. */
export function normalizeExploreReturnKinds(raw: unknown): string[] | undefined {
	const list: unknown[] = Array.isArray(raw)
		? raw
		: typeof raw === 'string' && raw.trim()
			? raw.split(/[,|]/).map(s => s.trim())
			: [];
	const out: string[] = [];
	for (const item of list) {
		const key = trimString(item).toLowerCase().replace(/-/g, '_');
		const alias =
			key === 'paths' ? 'paths_read'
				: key === 'summaries' ? 'file_summaries'
					: key === 'symbols' ? 'key_symbols'
						: key === 'snippets' ? 'code_snippets'
							: key === 'structure' ? 'structure_map'
								: key;
		if (KNOWN_RETURN_KINDS.has(alias) && !out.includes(alias)) {
			out.push(alias);
		}
	}
	return out.length > 0 ? out : undefined;
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
	const subagentType = trimString(a.subagent_type) || trimString(a.subagentType) || 'explore';
	const returnKinds = normalizeExploreReturnKinds(a.return_kinds ?? a.returnKinds);
	return {
		exploreTitle: deriveExploreTitle(a.title, description),
		exploreDescription: description,
		exploreThoroughness: thoroughness || undefined,
		exploreSubagentType: subagentType || undefined,
		exploreReturnKinds: returnKinds,
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
	const reportPath = trimString(o.report_path) || trimString(o.reportPath);
	const thoroughness = trimString(o.thoroughness);
	const subagentType = trimString(o.subagent_type) || trimString(o.subagentType);
	const exploreId = trimString(o.explore_id) || trimString(o.exploreId);
	const returnKinds = normalizeExploreReturnKinds(o.return_kinds ?? o.returnKinds)
		?? normalizeExploreReturnKinds(
			o.artifacts && typeof o.artifacts === 'object'
				? Object.keys(o.artifacts as Record<string, unknown>)
				: undefined,
		);
	const kindsIncomplete = normalizeExploreReturnKinds(o.kinds_incomplete ?? o.kindsIncomplete);
	const error =
		trimString(o.error) ||
		(isError && typeof o.message === 'string' ? o.message.trim() : '') ||
		(isError && !report ? 'Explore failed' : '');
	return {
		exploreReport: report || undefined,
		exploreReportPath: reportPath || undefined,
		exploreError: error || undefined,
		exploreThoroughness: thoroughness || undefined,
		exploreSubagentType: subagentType || undefined,
		exploreReturnKinds: returnKinds,
		exploreId: exploreId || undefined,
		exploreKindsIncomplete: kindsIncomplete,
	};
}
