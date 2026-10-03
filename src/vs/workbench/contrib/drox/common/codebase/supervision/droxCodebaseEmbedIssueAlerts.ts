/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxCodebaseAlert, IDroxCodebasePipelineEvent } from '../droxCodebaseTypes.js';

const MAX_PATH_ALERTS = 5;

/**
 * Sticky cockpit alerts from the latest pipeline run's embed skip/partial events.
 * Ids use `index-embed-*` so embed.status probe alerts (`embed-*`) do not wipe them.
 */
export function buildDroxCodebaseEmbedIssueAlerts(
	events: readonly IDroxCodebasePipelineEvent[],
): readonly IDroxCodebaseAlert[] {
	if (!events.length) {
		return [];
	}
	const last = events[events.length - 1]!;
	const runId = last.runId;
	const runEvents = events.filter(e => e.runId === runId);
	const issueEvents = runEvents.filter(e =>
		e.kind === 'embed_batch'
		&& e.status === 'warn'
		&& e.detail?.embedIssue === true
		&& typeof e.path === 'string'
		&& e.path.length > 0,
	);
	const partial = runEvents.some(e =>
		e.kind === 'embed_batch'
		&& e.status === 'warn'
		&& e.detail?.partial === true,
	);

	if (!issueEvents.length && !partial) {
		return [];
	}

	const byPath = new Map<string, IDroxCodebasePipelineEvent>();
	for (const ev of issueEvents) {
		if (ev.path && !byPath.has(ev.path)) {
			byPath.set(ev.path, ev);
		}
	}

	const at = Date.now();
	const alerts: IDroxCodebaseAlert[] = [];

	if (partial || byPath.size > 0) {
		const skippedFiles = typeof runEvents.find(e => e.detail?.partial === true)?.detail?.skippedFiles === 'number'
			? Number(runEvents.find(e => e.detail?.partial === true)!.detail!.skippedFiles)
			: byPath.size;
		alerts.push({
			id: 'index-embed-partial',
			severity: 'warn',
			code: 'EMBED_PARTIAL',
			message: `Embed completed with skips (${skippedFiles || byPath.size} file(s)). Lexical chunks stay indexed; hybrid vectors omit the bad paths. Fix or exclude those files, then Reindex.`,
			at,
		});
	}

	let i = 0;
	for (const [path, ev] of byPath) {
		if (i >= MAX_PATH_ALERTS) {
			alerts.push({
				id: 'index-embed-skip-more',
				severity: 'warn',
				code: 'EMBED_CHUNK_SKIPPED',
				message: `…and ${byPath.size - MAX_PATH_ALERTS} more file(s). Open the pipeline log for full paths, exclude them in the catalogue, then Reindex.`,
				at,
			});
			break;
		}
		const reason = typeof ev.detail?.reason === 'string' ? ev.detail.reason : 'issue';
		const guidance = typeof ev.detail?.guidance === 'string'
			? ev.detail.guidance
			: 'Exclude the file in Codebase catalogue, then Reindex.';
		alerts.push({
			id: `index-embed-skip-${i}`,
			severity: 'warn',
			code: 'EMBED_CHUNK_SKIPPED',
			message: `[${reason}] ${path} — ${guidance}`,
			at,
		});
		i++;
	}

	return alerts;
}
