/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IChatProgress } from '../../chat/common/chatService/chatService.js';
import { DroxCommands } from './drox.js';
import { IDroxFileChangePayload } from './droxFileChange.js';

function escapeHtml(text: string): string {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function formatOpLabel(change: IDroxFileChangePayload): string {
	if (!change.applied && change.cancelled) {
		return localize('drox.fileChange.op.cancelled', 'cancelled');
	}
	if (!change.applied) {
		return localize('drox.fileChange.op.skipped', 'skipped');
	}
	if (change.op === 'write') {
		return localize('drox.fileChange.op.written', 'written');
	}
	if (change.op === 'delete') {
		return localize('drox.fileChange.op.deleted', 'deleted');
	}
	return localize('drox.fileChange.op.edited', 'edited');
}

function buildDiffLinesHtml(diff: string, content: string): string {
	const lines: string[] = [];
	if (diff.trim().length > 0) {
		for (const raw of diff.split(/\r?\n/)) {
			if (
				raw.startsWith('--- ')
				|| raw.startsWith('+++ ')
				|| raw.startsWith('Index: ')
				|| raw.startsWith('==========')
			) {
				continue;
			}
			if (raw.startsWith('@@')) {
				lines.push(`<div class="diff-line diff-hunk">${escapeHtml(raw)}</div>`);
			} else if (raw.startsWith('+') && !raw.startsWith('++')) {
				lines.push(`<div class="diff-line diff-add">${escapeHtml(raw)}</div>`);
			} else if (raw.startsWith('-') && !raw.startsWith('--')) {
				lines.push(`<div class="diff-line diff-rem">${escapeHtml(raw)}</div>`);
			} else if (raw.length === 0) {
				lines.push('<div class="diff-line diff-ctx"> </div>');
			} else {
				lines.push(`<div class="diff-line diff-ctx">${escapeHtml(raw)}</div>`);
			}
		}
	} else if (content.length > 0) {
		for (const raw of content.split(/\r?\n/)) {
			lines.push(`<div class="diff-line diff-add">${escapeHtml(`+${raw}`)}</div>`);
		}
	}
	if (lines.length === 0) {
		lines.push(`<div class="diff-line diff-ctx">${escapeHtml(localize('drox.fileChange.noVisibleDiff', '(no visible diff)'))}</div>`);
	}
	return lines.join('');
}

function encodeCommandLink(commandId: string, args: unknown[]): string {
	return `command:${commandId}?${encodeURIComponent(JSON.stringify(args))}`;
}

/**
 * Carte diff Drox (alignée webview `12-fileChange.js`) pour le fil chat natif.
 * S'ajoute après la pilule upstream `externalEdit`.
 */
export function buildDroxNativeFileChangeMarkdown(change: IDroxFileChangePayload): MarkdownString {
	const relPath = escapeHtml(change.relPath || change.path || '?');
	const filePath = change.path || '';
	const toolId = String(change.toolId || '').trim();
	const added = Math.max(0, change.added ?? 0);
	const removed = Math.max(0, change.removed ?? 0);
	const op = formatOpLabel(change);
	const extraClass = [
		!change.applied ? 'is-not-applied' : '',
		change.cancelled ? 'is-cancelled' : '',
	].filter(Boolean).join(' ');

	const statsParts: string[] = [];
	if (added > 0) {
		statsParts.push(`<span class="fc-add">+${added}</span>`);
	}
	if (removed > 0) {
		statsParts.push(`<span class="fc-rem">-${removed}</span>`);
	}
	const statsHtml = statsParts.length > 0 ? `<span class="fc-stats">${statsParts.join('')}</span>` : '';

	const undoHtml = change.canUndo && toolId
		? `<a class="fc-undo" href="${encodeCommandLink(DroxCommands.UndoFileChange, [toolId])}">${escapeHtml(localize('drox.fileChange.undo', 'Undo'))}</a>`
		: '';
	const redoHtml = change.canUndo && toolId
		? `<a class="fc-redo" href="${encodeCommandLink(DroxCommands.RedoFileChange, [toolId])}" hidden>${escapeHtml(localize('drox.fileChange.redo', 'Redo'))}</a>`
		: '';

	const openHref = filePath
		? encodeCommandLink('vscode.open', [URI.file(filePath).toString()])
		: undefined;
	const pathHtml = openHref
		? `<a class="fc-path" href="${openHref}" title="${escapeHtml(filePath)}">${relPath}</a>`
		: `<span class="fc-path" title="${escapeHtml(filePath)}">${relPath}</span>`;

	const diffHtml = buildDiffLinesHtml(change.diff, change.content);

	const html = [
		`<div class="drox-native-file-change msg-file-change${extraClass ? ` ${extraClass}` : ''}"`,
		toolId ? ` data-tool-id="${escapeHtml(toolId)}"` : '',
		`>`,
		'<div class="fc-summary">',
		'<span class="fc-icon" aria-hidden="true">📄</span>',
		`<span class="fc-op">${escapeHtml(op)}</span>`,
		pathHtml,
		statsHtml,
		'<span class="fc-spacer"></span>',
		undoHtml,
		redoHtml,
		'</div>',
		'<div class="fc-body">',
		`<div class="fc-diff">${diffHtml}</div>`,
		'</div>',
		'</div>',
	].join('');

	return new MarkdownString(html, {
		isTrusted: {
			enabledCommands: [
				DroxCommands.UndoFileChange,
				DroxCommands.RedoFileChange,
				'vscode.open',
			],
		},
		supportHtml: true,
	});
}

export function droxNativeFileChangeMarkdownProgress(change: IDroxFileChangePayload): IChatProgress {
	return {
		kind: 'markdownContent',
		content: buildDroxNativeFileChangeMarkdown(change),
	};
}
