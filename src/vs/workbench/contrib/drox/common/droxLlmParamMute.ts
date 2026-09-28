/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Sampling / output keys that can be muted in the model panel.
 * Muted = value stays editable in settings, but is **not** sent on `agent.run`.
 */
export const DROX_LLM_MUTEABLE_PARAM_KEYS = [
	'numCtx',
	'temperature',
	'topP',
	'topK',
	'repeatPenalty',
	'minP',
	'seed',
	'presencePenalty',
	'frequencyPenalty',
	'maxTokens',
	'keepAlive',
	'reasoningEffort',
	'thinkingBudget',
] as const;

export type DroxLlmMuteableParamKey = (typeof DROX_LLM_MUTEABLE_PARAM_KEYS)[number];

const MUTEABLE_SET = new Set<string>(DROX_LLM_MUTEABLE_PARAM_KEYS);

export function normalizeDroxLlmParamsMuted(raw: unknown): readonly DroxLlmMuteableParamKey[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const out: DroxLlmMuteableParamKey[] = [];
	const seen = new Set<string>();
	for (const item of raw) {
		if (typeof item !== 'string' || !MUTEABLE_SET.has(item) || seen.has(item)) {
			continue;
		}
		seen.add(item);
		out.push(item as DroxLlmMuteableParamKey);
	}
	return out;
}

export function isDroxLlmParamMuted(
	muted: readonly string[] | undefined,
	key: DroxLlmMuteableParamKey,
): boolean {
	return Boolean(muted?.includes(key));
}

/** Value for wire: undefined when muted so the key is omitted from the request. */
export function liveDroxLlmParamValue<T>(
	muted: readonly string[] | undefined,
	key: DroxLlmMuteableParamKey,
	value: T | undefined,
): T | undefined {
	return isDroxLlmParamMuted(muted, key) ? undefined : value;
}
