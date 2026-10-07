/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxCodebaseRetrievalFilter, IDroxModelQuestionVariant } from './droxModelQuestionTypes.js';

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
