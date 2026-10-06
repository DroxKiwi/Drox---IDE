/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { match as globMatch } from '../../../../../base/common/glob.js';
import { IDroxRule, IDroxRuleSelectOpts } from './droxRulesTypes.js';

function isUniversalPattern(pattern: string): boolean {
	const p = pattern.trim();
	return p === '**' || p === '**/*' || p === '*' || p === '**/**';
}

function normalizeContextPath(path: string): string {
	return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function pathMatchesPattern(path: string, pattern: string): boolean {
	const p = pattern.trim();
	if (!p) {
		return false;
	}
	if (isUniversalPattern(p)) {
		return true;
	}
	const candidate = normalizeContextPath(path);
	// match() uses posix-style; try full path and basename-friendly patterns.
	if (globMatch(p, candidate)) {
		return true;
	}
	// Patterns like `*.rs` should match nested files.
	if (!p.includes('/') && !p.startsWith('**')) {
		return globMatch(`**/${p}`, candidate);
	}
	return false;
}

/**
 * Whether a rule should be auto-injected for this run.
 *
 * - `alwaysApply` or universal `applyTo` → yes
 * - scoped globs → yes iff any context path matches
 * - no alwaysApply and empty applyTo → **not** auto-injected (on-demand / Customizations only)
 */
export function droxRuleShouldAutoInject(rule: IDroxRule, opts?: IDroxRuleSelectOpts): boolean {
	if (rule.alwaysApply) {
		return true;
	}
	if (rule.applyTo.some(isUniversalPattern)) {
		return true;
	}
	if (rule.applyTo.length === 0) {
		return false;
	}
	const paths = (opts?.contextPaths ?? []).map(normalizeContextPath).filter(Boolean);
	if (paths.length === 0) {
		return false;
	}
	return rule.applyTo.some(pattern => paths.some(path => pathMatchesPattern(path, pattern)));
}

export function selectDroxRulesForRun(
	rules: readonly IDroxRule[],
	opts?: IDroxRuleSelectOpts,
): IDroxRule[] {
	return rules.filter(r => droxRuleShouldAutoInject(r, opts));
}
