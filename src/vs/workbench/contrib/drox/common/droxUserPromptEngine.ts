/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Max lines sent to the engine for a single user prompt (G-CTX-01). */
export const USER_PROMPT_ENGINE_MAX_LINES = 80;

/** Header lines kept when truncating long error dumps. */
export const USER_PROMPT_ENGINE_KEEP_LINES = 20;

/**
 * Truncate very long user prompts (e.g. hydration stack traces) before `agent.run`.
 * UI display is unchanged — only the engine payload is capped.
 */
export function truncateUserPromptForEngine(
	prompt: string,
	maxLines: number = USER_PROMPT_ENGINE_MAX_LINES,
	keepLines: number = USER_PROMPT_ENGINE_KEEP_LINES,
): string {
	const normalized = prompt.replace(/\r\n/g, '\n');
	const lines = normalized.split('\n');
	if (lines.length <= maxLines) {
		return prompt;
	}
	const head = lines.slice(0, keepLines);
	const omitted = lines.length - keepLines;
	return `${head.join('\n')}\n\n… [truncated — ${omitted} lines omitted]`;
}
