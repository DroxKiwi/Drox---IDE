/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Parsed Drox project rule (`.drox/rules/*`). */
export interface IDroxRule {
	readonly id: string;
	readonly relativePath: string;
	readonly description: string | undefined;
	/** When true, always inject (Cursor `alwaysApply`). */
	readonly alwaysApply: boolean;
	/**
	 * Glob patterns (Cursor `globs` / VS Code `applyTo`).
	 * Empty + !alwaysApply → agent-requestable only (not auto-injected).
	 */
	readonly applyTo: readonly string[];
	readonly body: string;
}

export interface IDroxRuleSelectOpts {
	/** Workspace-relative or absolute paths used for glob matching. */
	readonly contextPaths?: readonly string[];
}

export interface IDroxRulesAnnexResult {
	readonly text: string;
	readonly ruleCount: number;
	readonly chars: number;
	readonly truncated: boolean;
}
