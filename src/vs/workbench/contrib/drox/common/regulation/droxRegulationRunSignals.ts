/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxEngineTraceRecord } from '../chat/droxEngineTraceExport.js';
import { IDroxSessionUiStats, IDroxTranscriptMessage } from '../droxSession.js';
import { isDroxLoopDetectedError } from '../droxLoopAbort.js';
import { DroxRegulationRunIssue } from './droxRegulationTypes.js';

/** Normalized per-run inputs for scorer v0 (no UI / no persistence). */
export interface IDroxRegulationRunSignals {
	readonly issue: DroxRegulationRunIssue;
	readonly schemaErrorContinueCount: number;
	readonly textToolMarkerStreak: number;
	readonly contextTokens: number;
	readonly llmIterations: number;
	readonly expectsWorkspaceMutation: boolean;
	readonly greetingOnly: boolean;
	readonly toolErrorCount: number;
	readonly usedCodebaseSearch: boolean;
	readonly usedRetrievalTools: boolean;
}

export function extractDroxRegulationRunIssue(
	status: string | undefined,
	error: string | undefined,
): DroxRegulationRunIssue {
	if (status === 'cancel' || status === 'cancelled') {
		return 'cancel';
	}
	if (error && isDroxLoopDetectedError(error)) {
		return 'loop';
	}
	if (status === 'error') {
		return 'error';
	}
	return 'ok';
}

function lastRunSummary(trace: readonly IDroxEngineTraceRecord[] | undefined): IDroxEngineTraceRecord | undefined {
	if (!trace?.length) {
		return undefined;
	}
	for (let i = trace.length - 1; i >= 0; i--) {
		if (trace[i].kind === 'run_summary') {
			return trace[i];
		}
	}
	return undefined;
}

function countToolErrors(messages: readonly IDroxTranscriptMessage[] | undefined): number {
	if (!messages?.length) {
		return 0;
	}
	let n = 0;
	for (const m of messages) {
		if (m.role !== 'tool') {
			continue;
		}
		for (const c of m.content) {
			if (c.type === 'tool_result' && c.is_error) {
				n++;
			}
		}
	}
	return n;
}

const RETRIEVAL_TOOL_NAMES = new Set(['codebase_search', 'grep', 'glob', 'lsp']);

function scanTranscriptTools(messages: readonly IDroxTranscriptMessage[] | undefined): {
	readonly usedCodebaseSearch: boolean;
	readonly usedRetrievalTools: boolean;
} {
	let usedCodebaseSearch = false;
	let usedRetrievalTools = false;
	if (!messages?.length) {
		return { usedCodebaseSearch, usedRetrievalTools };
	}
	for (const m of messages) {
		if (m.role !== 'assistant') {
			continue;
		}
		for (const c of m.content) {
			if (c.type !== 'tool_use' || typeof c.name !== 'string') {
				continue;
			}
			if (c.name === 'codebase_search') {
				usedCodebaseSearch = true;
			}
			if (RETRIEVAL_TOOL_NAMES.has(c.name)) {
				usedRetrievalTools = true;
			}
		}
	}
	return { usedCodebaseSearch, usedRetrievalTools };
}

export function buildDroxRegulationRunSignals(opts: {
	readonly status?: string;
	readonly error?: string;
	readonly engineTrace?: readonly IDroxEngineTraceRecord[];
	readonly uiStats?: IDroxSessionUiStats;
	readonly messages?: readonly IDroxTranscriptMessage[];
}): IDroxRegulationRunSignals {
	const summary = lastRunSummary(opts.engineTrace);
	const toolScan = scanTranscriptTools(opts.messages);
	const issue = extractDroxRegulationRunIssue(opts.status, opts.error);
	return {
		issue,
		schemaErrorContinueCount: Math.max(0, summary?.schemaErrorContinueCount ?? 0),
		textToolMarkerStreak: Math.max(0, summary?.textToolMarkerStreak ?? 0),
		contextTokens: Math.max(0, opts.uiStats?.ctx ?? 0),
		llmIterations: Math.max(0, summary?.llmIterations ?? 0),
		expectsWorkspaceMutation: Boolean(summary?.expectsWorkspaceMutation),
		greetingOnly: Boolean(summary?.greetingOnly),
		toolErrorCount: countToolErrors(opts.messages),
		usedCodebaseSearch: toolScan.usedCodebaseSearch,
		usedRetrievalTools: toolScan.usedRetrievalTools,
	};
}
