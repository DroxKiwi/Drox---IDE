/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import type { IDroxEngineTraceRecord } from './chat/droxEngineTraceExport.js';

export type { IDroxEngineTraceRecord } from './chat/droxEngineTraceExport.js';

export interface IDroxSessionListEntry {
	readonly id: string;
	readonly modifiedSecs: number;
	readonly sizeBytes: number;
	/** Premier message utilisateur (moteur `session.list`). */
	readonly title?: string;
}

/** Titre d’onglet / historique à partir du transcript chargé. */
export function deriveTitleFromTranscriptMessages(
	messages: readonly IDroxTranscriptMessage[],
	max = 36,
): string {
	for (const m of messages) {
		if (m.role !== 'user') {
			continue;
		}
		const parts: string[] = [];
		for (const c of m.content) {
			if (c.type === 'text' && typeof c.text === 'string' && c.text.trim()) {
				parts.push(c.text.trim());
			}
		}
		const joined = parts.join(' ').replace(/\s+/g, ' ').trim();
		if (joined.length >= 3) {
			const normalized = joined;
			if (normalized.length <= max) {
				return normalized;
			}
			return `${normalized.slice(0, max - 1)}…`;
		}
	}
	return '';
}

export interface IDroxSessionUiStats {
	readonly totalIn: number;
	readonly totalOut: number;
	readonly ctx: number;
}

export interface IDroxTranscriptContentBlock {
	readonly type: string;
	readonly text?: string;
	readonly name?: string;
	readonly content?: string;
	readonly is_error?: boolean;
	/** `tool_use` — identifiant du call. */
	readonly id?: string;
	/** `tool_use` — arguments JSON. */
	readonly input?: unknown;
	/** `tool_result` — lien vers le `tool_use`. */
	readonly tool_use_id?: string;
}

export interface IDroxTranscriptMessage {
	readonly role: 'system' | 'user' | 'assistant' | 'tool';
	readonly content: IDroxTranscriptContentBlock[];
}

export interface IDroxSessionReadResult {
	readonly messages: IDroxTranscriptMessage[];
	readonly uiStats?: IDroxSessionUiStats;
	readonly engineTrace?: readonly IDroxEngineTraceRecord[];
}

export type DroxReplayAppend = {
	readonly role: 'user' | 'assistant' | 'system';
	readonly text: string;
};

/** Light transcript replay (user / assistant / system lines only). */
export function transcriptMessageToReplayAppends(m: IDroxTranscriptMessage): DroxReplayAppend[] {
	const blocks = Array.isArray(m.content) ? m.content : [];
	if (m.role === 'system' || m.role === 'user') {
		const text = blocks
			.filter(c => c.type === 'text' && typeof c.text === 'string')
			.map(c => c.text!)
			.join('\n')
			.trim();
		return text ? [{ role: m.role, text }] : [];
	}
	if (m.role === 'assistant') {
		const parts: string[] = [];
		for (const c of blocks) {
			if (c.type === 'text' && typeof c.text === 'string') {
				parts.push(c.text);
			} else if (c.type === 'tool_use' && typeof c.name === 'string') {
				parts.push(`\n[tool] ${c.name}`);
			}
		}
		const text = parts.join('').trim();
		return text ? [{ role: 'assistant', text }] : [];
	}
	if (m.role === 'tool') {
		const out: DroxReplayAppend[] = [];
		for (const c of blocks) {
			if (c.type === 'tool_result' && typeof c.content === 'string') {
				const raw = c.content;
				const isError = Boolean(c.is_error);
				const head = isError ? '[tool · error]' : '[tool]';
				const snippet = raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;
				out.push({ role: 'system', text: `${head} ${snippet}` });
			}
		}
		return out;
	}
	return [];
}

export function formatSessionBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) {
		return '?';
	}
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSessionRelativeTime(modifiedSecs: number): string {
	if (!Number.isFinite(modifiedSecs) || modifiedSecs <= 0) {
		return '';
	}
	const delta = Math.max(0, Math.floor(Date.now() / 1000) - modifiedSecs);
	if (delta < 60) {
		return 'just now';
	}
	if (delta < 3600) {
		return `${Math.floor(delta / 60)} min ago`;
	}
	if (delta < 86_400) {
		return `${Math.floor(delta / 3600)} h ago`;
	}
	return `${Math.floor(delta / 86_400)} d ago`;
}
