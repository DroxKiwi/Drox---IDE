/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

export interface IDroxSessionCompactUsage {

	readonly inputTokens: number;

	readonly outputTokens: number;

}



export interface IDroxSessionCompactResult {

	readonly summary: string;

	readonly objective?: string;

	readonly filesTouched: string[];

	readonly usage?: IDroxSessionCompactUsage;

}



export function parseSessionCompactRpcResult(raw: unknown): IDroxSessionCompactResult {

	const r = raw as Record<string, unknown>;

	const usageRaw = r.usage as Record<string, unknown> | undefined;

	let usage: IDroxSessionCompactUsage | undefined;

	if (usageRaw && typeof usageRaw === 'object') {

		usage = {

			inputTokens: Number(usageRaw.inputTokens ?? usageRaw.input_tokens ?? 0),

			outputTokens: Number(usageRaw.outputTokens ?? usageRaw.output_tokens ?? 0),

		};

	}

	const files = r.filesTouched ?? r.files_touched;

	return {

		summary: typeof r.summary === 'string' ? r.summary : '',

		objective: typeof r.objective === 'string' ? r.objective : undefined,

		filesTouched: Array.isArray(files) ? files.filter((f): f is string => typeof f === 'string') : [],

		usage,

	};

}



export function formatSessionCompactChatMessage(res: IDroxSessionCompactResult): string {

	let text = `**Manual compaction** (\`session.compact\`)\n\n${res.summary}`;

	if (res.objective) {

		text = `**Objective** (excerpt): ${res.objective}\n\n` + text;

	}

	if (res.filesTouched.length > 0) {

		text += '\n\n**Files mentioned**: ' + res.filesTouched.map(f => `\`${f}\``).join(', ');

	}

	if (res.usage) {

		text += `\n\n_(tokens compaction ↑${res.usage.inputTokens} ↓${res.usage.outputTokens})_`;

	}

	if (text.length > 20_000) {

		text = text.slice(0, 20_000) + '\n\n…_(truncated)_';

	}

	return text;

}

