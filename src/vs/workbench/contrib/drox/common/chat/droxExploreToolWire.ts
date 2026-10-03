/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

export interface IDroxExploreToolStartWire {
	readonly exploreDescription: string;
	readonly exploreThoroughness?: string;
}

export interface IDroxExploreToolFinishWire {
	readonly exploreReport?: string;
	readonly exploreError?: string;
	readonly exploreThoroughness?: string;
}

/** Cursor-shaped `toolSpecificData` for Agents chat (`IChatSubagentToolInvocationData`). */
export interface IDroxExploreSubagentToolData {
	readonly kind: 'subagent';
	readonly agentName: 'explore';
	readonly description: string;
	readonly prompt?: string;
	readonly result?: string;
}

export function buildExploreSubagentToolSpecificData(
	start: IDroxExploreToolStartWire,
	finish?: IDroxExploreToolFinishWire,
): IDroxExploreSubagentToolData {
	const result = trimString(finish?.exploreReport) || trimString(finish?.exploreError);
	return {
		kind: 'subagent',
		agentName: 'explore',
		description: start.exploreDescription,
		prompt: start.exploreDescription,
		result: result || undefined,
	};
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function trimString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
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
	return {
		exploreDescription: description,
		exploreThoroughness: thoroughness || undefined,
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
	const thoroughness = trimString(o.thoroughness);
	const error =
		trimString(o.error) ||
		(isError && typeof o.message === 'string' ? o.message.trim() : '') ||
		(isError && !report ? 'Explore failed' : '');
	return {
		exploreReport: report || undefined,
		exploreError: error || undefined,
		exploreThoroughness: thoroughness || undefined,
	};
}
