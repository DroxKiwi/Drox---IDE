/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxRule, IDroxRulesAnnexResult } from './droxRulesTypes.js';

/** Soft budget for auto-injected project rules (chars). */
export const DROX_RULES_AUTO_INJECT_DEFAULT_MAX_CHARS = 12_000;

/**
 * Format selected rules into a system annex for `agent.run`.
 */
export function formatDroxRulesAnnex(
	rules: readonly IDroxRule[],
	opts?: { readonly maxChars?: number },
): IDroxRulesAnnexResult | undefined {
	if (!rules.length) {
		return undefined;
	}
	const maxChars = opts?.maxChars ?? DROX_RULES_AUTO_INJECT_DEFAULT_MAX_CHARS;
	const header = [
		'# Project rules (Drox — auto)',
		'',
		'Follow these workspace rules when they apply. They come from `.drox/rules/` (and user `~/.drox/rules/` when present).',
		'',
	].join('\n');

	const parts: string[] = [header];
	let chars = header.length;
	let used = 0;
	let truncated = false;

	for (const rule of rules) {
		const title = rule.description?.trim() || rule.id;
		const scope = rule.alwaysApply
			? 'alwaysApply'
			: rule.applyTo.length
				? `applyTo: ${rule.applyTo.join(', ')}`
				: 'scoped';
		const block = [
			`## Rule: ${title}`,
			`(${rule.relativePath} · ${scope})`,
			'',
			rule.body.trim(),
			'',
			'---',
			'',
		].join('\n');

		if (chars + block.length > maxChars && used > 0) {
			truncated = true;
			break;
		}
		if (chars + block.length > maxChars && used === 0) {
			const room = Math.max(0, maxChars - chars - 20);
			parts.push(block.slice(0, room) + '\n…\n');
			used = 1;
			truncated = true;
			chars = maxChars;
			break;
		}
		parts.push(block);
		chars += block.length;
		used++;
	}

	const text = parts.join('\n').trim();
	return { text, ruleCount: used, chars: text.length, truncated };
}
