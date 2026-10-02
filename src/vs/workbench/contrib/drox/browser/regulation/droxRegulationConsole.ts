/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import { droxRegulationScoreBand } from '../../common/regulation/droxRegulationScoreBand.js';
import {
	DROX_REGULATION_DEFAULT_MODULES,
	DROX_REGULATION_LEVER_IDS,
	DROX_REGULATION_LEVER_LABELS,
	DroxRegulationRunIssue,
	IDroxRegulationHistoryEntry,
	IDroxRegulationScoreSnapshot,
} from '../../common/regulation/droxRegulationTypes.js';
import './media/droxRegulationConsole.css';

/**
 * R3 observatory: live lever scores + run history.
 * No Auto / override controls yet (R5).
 */
export function renderDroxRegulationConsole(
	parent: HTMLElement,
	opts: {
		readonly modelKey: string;
		readonly scores: IDroxRegulationScoreSnapshot;
		readonly history: readonly IDroxRegulationHistoryEntry[];
		readonly prevListScroll?: number;
	},
): { readonly listEl: HTMLElement | undefined } {
	const section = dom.append(parent, dom.$('.drox-codebase-section.drox-regulation-console'));
	dom.append(section, dom.$('h4', undefined, localize('drox.regulation.console.title', 'Model regulation')));
	dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
		'drox.regulation.console.subtitle',
		'Observatory — engine fitness for the current model (no Auto apply yet).',
	)));
	dom.append(section, dom.$('p.drox-codebase-muted', undefined, opts.modelKey
		? localize('drox.regulation.console.model', 'Model: {0}', opts.modelKey)
		: localize('drox.regulation.console.noModel', 'Model: —')));

	const globalBand = droxRegulationScoreBand(opts.scores.globalScore);
	const globalRow = dom.append(section, dom.$('.drox-regulation-global'));
	globalRow.classList.add(`is-${globalBand}`);
	dom.append(globalRow, dom.$('span.drox-regulation-global-label', undefined, localize(
		'drox.regulation.console.global',
		'Global',
	)));
	dom.append(globalRow, dom.$('span.drox-regulation-score', undefined, String(Math.round(opts.scores.globalScore))));
	dom.append(globalRow, dom.$('span.drox-codebase-muted', undefined, localize(
		'drox.regulation.console.samples',
		'{0} runs',
		String(opts.scores.samples),
	)));

	const levers = dom.append(section, dom.$('.drox-regulation-levers'));
	for (const lever of DROX_REGULATION_LEVER_IDS) {
		const ls = opts.scores.levers[lever];
		const band = droxRegulationScoreBand(ls.score);
		const row = dom.append(levers, dom.$('.drox-regulation-lever'));
		row.classList.add(`is-${band}`);
		dom.append(row, dom.$('span.drox-regulation-lever-id', undefined, lever));
		dom.append(row, dom.$('span.drox-regulation-lever-label', undefined, DROX_REGULATION_LEVER_LABELS[lever]));
		dom.append(row, dom.$('span.drox-regulation-score', undefined, String(Math.round(ls.score))));
		dom.append(row, dom.$('span.drox-codebase-muted', undefined, `n=${ls.samples}`));
		dom.append(row, dom.$('span.drox-regulation-module', undefined, DROX_REGULATION_DEFAULT_MODULES[lever]));
	}

	dom.append(section, dom.$('h4', undefined, localize('drox.regulation.history.title', 'Run history')));
	if (!opts.history.length) {
		dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
			'drox.regulation.history.empty',
			'No runs scored yet — finish an agent run to populate.',
		)));
		return { listEl: undefined };
	}

	const list = dom.append(section, dom.$('.drox-regulation-history-list'));
	const rows = [...opts.history].slice().reverse().slice(0, 40);
	for (const entry of rows) {
		appendHistoryRow(list, entry);
	}
	if (typeof opts.prevListScroll === 'number') {
		list.scrollTop = opts.prevListScroll;
	}
	return { listEl: list };
}

function appendHistoryRow(parent: HTMLElement, entry: IDroxRegulationHistoryEntry): void {
	const row = dom.append(parent, dom.$('.drox-regulation-history-row'));
	const band = droxRegulationScoreBand(entry.globalScore);
	row.classList.add(`is-${band}`);

	const head = dom.append(row, dom.$('.drox-regulation-history-head'));
	dom.append(head, dom.$('span.drox-regulation-issue', undefined, issueLabel(entry.issue))).classList.add(`is-${entry.issue}`);
	dom.append(head, dom.$('span.drox-regulation-score', undefined, String(Math.round(entry.globalScore))));
	dom.append(head, dom.$('span.drox-codebase-muted', undefined, formatWhen(entry.at)));

	const prompt = entry.promptExcerpt.trim() || localize('drox.regulation.history.noPrompt', '(no prompt excerpt)');
	dom.append(row, dom.$('p.drox-regulation-history-prompt', undefined, prompt));

	dom.append(row, dom.$('p.drox-codebase-muted', undefined, localize(
		'drox.regulation.history.meta',
		'{0} · L1 {1} · L2 {2} · L3 {3} · L4 {4} · L5 {5}',
		entry.modelKey,
		String(Math.round(entry.leverScores.L1)),
		String(Math.round(entry.leverScores.L2)),
		String(Math.round(entry.leverScores.L3)),
		String(Math.round(entry.leverScores.L4)),
		String(Math.round(entry.leverScores.L5)),
	)));
}

function issueLabel(issue: DroxRegulationRunIssue): string {
	switch (issue) {
		case 'ok': return 'ok';
		case 'error': return 'error';
		case 'cancel': return 'cancel';
		case 'loop': return 'loop';
	}
}

function formatWhen(at: number): string {
	try {
		return new Date(at).toLocaleString();
	} catch {
		return String(at);
	}
}
