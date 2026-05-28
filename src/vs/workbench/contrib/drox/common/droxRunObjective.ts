/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

const RUN_OBJECTIVE_MAX_CHARS = 220;
const MIN_OBJECTIVE_LEN = 8;

function stripInjectedBlocks(prompt: string): string {
	for (const marker of [
		'[User references]',
		'[Références utilisateur]',
		'[Attached images]',
		'[Images jointes]',
	]) {
		const idx = prompt.indexOf(marker);
		if (idx >= 0) {
			return prompt.slice(0, idx).trim();
		}
	}
	return prompt.trim();
}

/** Heuristic run objective from user prompt (first paragraph, truncated). */
export function extractRunObjective(prompt: string): string | undefined {
	const stripped = stripInjectedBlocks(prompt);
	if (!stripped) {
		return undefined;
	}
	const firstPara = (stripped.split(/\n\n+/)[0] ?? stripped).trim();
	const oneLine = firstPara.replace(/\s+/g, ' ').trim();
	if (oneLine.length < MIN_OBJECTIVE_LEN) {
		return undefined;
	}
	if (oneLine.length <= RUN_OBJECTIVE_MAX_CHARS) {
		return oneLine;
	}
	return `${oneLine.slice(0, RUN_OBJECTIVE_MAX_CHARS - 1)}…`;
}
