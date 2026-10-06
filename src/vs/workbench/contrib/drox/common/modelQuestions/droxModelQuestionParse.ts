/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxCodebaseRetrievalFilter, IDroxExploreMission, IDroxExploreMissionPlan, IDroxModelQuestionVariant } from './droxModelQuestionTypes.js';

/** Extract first JSON object from model text (tolerates accidental fences). */
export function extractJsonObjectText(raw: string): string | undefined {
	const trimmed = raw.trim();
	if (!trimmed) {
		return undefined;
	}
	const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const body = fence?.[1]?.trim() ?? trimmed;
	const start = body.indexOf('{');
	const end = body.lastIndexOf('}');
	if (start < 0 || end <= start) {
		return undefined;
	}
	return body.slice(start, end + 1);
}

export function parseCodebaseRetrievalFilter(
	rawModelText: string,
	variant: IDroxModelQuestionVariant,
): IDroxCodebaseRetrievalFilter | undefined {
	const jsonText = extractJsonObjectText(rawModelText);
	if (!jsonText) {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText);
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== 'object') {
		return undefined;
	}
	const o = parsed as Record<string, unknown>;
	const searchQuery = typeof o.searchQuery === 'string' ? o.searchQuery.trim() : '';
	if (!searchQuery) {
		return undefined;
	}
	const pathPrefixes = Array.isArray(o.pathPrefixes)
		? o.pathPrefixes.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).map(p => p.replace(/\\/g, '/').replace(/^\//, ''))
		: [];
	return {
		searchQuery,
		pathPrefixes,
		preferCodeFiles: o.preferCodeFiles === true,
		skipRetrieval: o.skipRetrieval === true,
		questionId: variant.questionId,
		variantId: variant.variantId,
	};
}

function parseThoroughness(raw: unknown): IDroxExploreMission['thoroughness'] {
	const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
	if (s === 'quick') {
		return 'quick';
	}
	if (s === 'very thorough' || s === 'very_thorough' || s === 'very-thorough') {
		return 'very thorough';
	}
	return 'medium';
}

export function parseExploreMissionPlan(
	rawModelText: string,
	variant: IDroxModelQuestionVariant,
): IDroxExploreMissionPlan | undefined {
	const jsonText = extractJsonObjectText(rawModelText);
	if (!jsonText) {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText);
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== 'object') {
		return undefined;
	}
	const o = parsed as Record<string, unknown>;
	const needsExplore = o.needsExplore === true;
	if (!needsExplore) {
		return {
			needsExplore: false,
			missionCount: 0,
			missions: [],
			questionId: variant.questionId,
			variantId: variant.variantId,
		};
	}
	const missionsRaw = Array.isArray(o.missions) ? o.missions : [];
	const missions: IDroxExploreMission[] = [];
	for (const m of missionsRaw) {
		if (!m || typeof m !== 'object') {
			continue;
		}
		const row = m as Record<string, unknown>;
		const title = typeof row.title === 'string' ? row.title.trim() : '';
		const scope = typeof row.scope === 'string' ? row.scope.trim() : '';
		if (!title || !scope) {
			continue;
		}
		const mustReturn = Array.isArray(row.mustReturn)
			? row.mustReturn.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(x => x.trim())
			: [];
		missions.push({
			title: title.slice(0, 80),
			scope,
			mustReturn,
			thoroughness: parseThoroughness(row.thoroughness),
		});
		if (missions.length >= 4) {
			break;
		}
	}
	if (missions.length === 0) {
		return undefined;
	}
	const counted = typeof o.missionCount === 'number' && Number.isFinite(o.missionCount)
		? Math.floor(o.missionCount)
		: missions.length;
	const missionCount = Math.min(4, Math.max(1, Math.min(counted, missions.length)));
	return {
		needsExplore: true,
		missionCount,
		missions: missions.slice(0, missionCount),
		questionId: variant.questionId,
		variantId: variant.variantId,
	};
}

/** Build engine system annex from a decompose plan (mechanical). */
export function formatExploreMissionPlanAnnex(plan: IDroxExploreMissionPlan): string | undefined {
	if (!plan.needsExplore || plan.missions.length === 0) {
		return undefined;
	}
	const n = plan.missions.length;
	const lines: string[] = [
		'EXPLORE MISSION PLAN — model decompose (session master)',
		'',
		`needsExplore=true missionCount=${n}. Follow **Plan → Assign → Merge**:`,
		`1. \`todo_write\` with ${n} explore step(s) matching the missions below.`,
		'2. Spawn one focused `task` (`explore`) per mission — copy title / scope into description; set `must_return` from mustReturn.',
		'3. Merge reports only — do not parent-read the whole tree.',
		'',
	];
	plan.missions.forEach((m, i) => {
		lines.push(`### Mission ${i + 1}: ${m.title}`);
		lines.push(`- scope: ${m.scope}`);
		lines.push(`- thoroughness: ${m.thoroughness}`);
		lines.push(`- must_return: ${m.mustReturn.length ? m.mustReturn.map(x => JSON.stringify(x)).join(', ') : '(fill concrete acceptance criteria)'}`);
		lines.push('');
	});
	return lines.join('\n').trim();
}
