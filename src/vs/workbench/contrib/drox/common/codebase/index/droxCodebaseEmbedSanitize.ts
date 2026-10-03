/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type DroxEmbedChunkIssueReason = 'null_byte' | 'binary_control' | 'encode_failed' | 'empty_after_sanitize';

export interface IDroxEmbedChunkIssue {
	readonly path: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly reason: DroxEmbedChunkIssueReason;
	readonly guidance: string;
}

export interface IDroxEmbedPreparedChunk {
	readonly path: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly chunkId: string;
	/** Text sent to embed.encode (nul-stripped, capped). */
	readonly text: string;
	readonly issues: readonly IDroxEmbedChunkIssue[];
	/** When true, do not call encode for this chunk. */
	readonly skipEncode: boolean;
}

const CONTROL_RATIO_THRESHOLD = 0.08;
const MAX_EMBED_CHARS = 2000;

export function guidanceForEmbedIssue(reason: DroxEmbedChunkIssueReason): string {
	switch (reason) {
		case 'null_byte':
			return 'File contains NUL bytes (often binary or a corrupted document). Invalid bytes are stripped for encode when possible — still prefer excluding the file in Codebase catalogue, or fix/replace it, then Reindex.';
		case 'binary_control':
			return 'File looks binary (many control characters). Exclude it from the index, or keep only source/text files, then Reindex.';
		case 'empty_after_sanitize':
			return 'Chunk was empty after removing invalid bytes — exclude the file or restore readable text, then Reindex.';
		case 'encode_failed':
			return 'Embed encode failed for this chunk. Check the file content, exclude it if it is not source text, then Reindex.';
		default:
			return 'Exclude the problematic path in Codebase catalogue, then Reindex.';
	}
}

/** Prepare chunk text for llama.cpp (no NUL) and flag suspicious binary content. */
export function prepareChunkForEmbed(opts: {
	readonly id: string;
	readonly path: string;
	readonly startLine: number;
	readonly endLine: number;
	readonly text: string;
}): IDroxEmbedPreparedChunk {
	const raw = opts.text.slice(0, MAX_EMBED_CHARS);
	const issues: IDroxEmbedChunkIssue[] = [];
	const nullCount = countNul(raw);
	const controlRatio = controlCharRatio(raw);

	if (controlRatio >= CONTROL_RATIO_THRESHOLD && nullCount === 0) {
		issues.push(issue(opts, 'binary_control'));
		return {
			path: opts.path,
			startLine: opts.startLine,
			endLine: opts.endLine,
			chunkId: opts.id,
			text: '',
			issues,
			skipEncode: true,
		};
	}

	let text = raw;
	if (nullCount > 0) {
		issues.push(issue(opts, 'null_byte'));
		text = stripNul(raw);
	}

	if (!text.trim()) {
		issues.push(issue(opts, 'empty_after_sanitize'));
		return {
			path: opts.path,
			startLine: opts.startLine,
			endLine: opts.endLine,
			chunkId: opts.id,
			text: '',
			issues,
			skipEncode: true,
		};
	}

	return {
		path: opts.path,
		startLine: opts.startLine,
		endLine: opts.endLine,
		chunkId: opts.id,
		text,
		issues,
		skipEncode: false,
	};
}

export function isEmbedNulByteError(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);
	return /nul byte/i.test(msg) || /null byte/i.test(msg);
}

function issue(
	opts: { readonly path: string; readonly startLine: number; readonly endLine: number },
	reason: DroxEmbedChunkIssueReason,
): IDroxEmbedChunkIssue {
	return {
		path: opts.path,
		startLine: opts.startLine,
		endLine: opts.endLine,
		reason,
		guidance: guidanceForEmbedIssue(reason),
	};
}

function countNul(text: string): number {
	let n = 0;
	for (let i = 0; i < text.length; i++) {
		if (text.charCodeAt(i) === 0) {
			n++;
		}
	}
	return n;
}

function stripNul(text: string): string {
	if (!text.includes('\0')) {
		return text;
	}
	return text.split('\0').join('');
}

/** Ratio of non-whitespace C0 controls (excluding TAB/LF/CR). */
function controlCharRatio(text: string): number {
	if (!text.length) {
		return 0;
	}
	let bad = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c === 0 || (c < 32 && c !== 9 && c !== 10 && c !== 13)) {
			bad++;
		}
	}
	return bad / text.length;
}
