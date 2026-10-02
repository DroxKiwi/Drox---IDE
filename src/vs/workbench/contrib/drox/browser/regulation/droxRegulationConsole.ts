/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { localize } from '../../../../../nls.js';
import {
	droxRegulationGlobalScoreSeries,
	droxRegulationIssueBreakdown,
	droxRegulationSparklinePoints,
} from '../../common/regulation/droxRegulationCharts.js';
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
 * R3–R4 observatory: live lever scores + charts + run history.
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

	renderCharts(section, opts.history);

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

function renderCharts(section: HTMLElement, history: readonly IDroxRegulationHistoryEntry[]): void {
	const charts = dom.append(section, dom.$('.drox-regulation-charts'));
	dom.append(charts, dom.$('h4', undefined, localize('drox.regulation.charts.title', 'Trends')));

	if (!history.length) {
		dom.append(charts, dom.$('p.drox-codebase-muted', undefined, localize(
			'drox.regulation.charts.empty',
			'Charts appear after the first scored run.',
		)));
		return;
	}

	const series = droxRegulationGlobalScoreSeries(history, 40);
	const sparkWrap = dom.append(charts, dom.$('.drox-regulation-spark'));
	dom.append(sparkWrap, dom.$('p.drox-regulation-chart-label', undefined, localize(
		'drox.regulation.charts.globalOverTime',
		'Global score over time',
	)));
	const svgNS = 'http://www.w3.org/2000/svg';
	const width = 280;
	const height = 48;
	const svg = document.createElementNS(svgNS, 'svg');
	svg.setAttribute('class', 'drox-regulation-spark-svg');
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
	svg.setAttribute('width', '100%');
	svg.setAttribute('height', String(height));
	svg.setAttribute('role', 'img');
	svg.setAttribute('aria-label', localize('drox.regulation.charts.sparkAria', 'Global score sparkline'));
	const baseline = document.createElementNS(svgNS, 'line');
	baseline.setAttribute('x1', '2');
	baseline.setAttribute('x2', String(width - 2));
	baseline.setAttribute('y1', String(height / 2));
	baseline.setAttribute('y2', String(height / 2));
	baseline.setAttribute('class', 'drox-regulation-spark-baseline');
	svg.appendChild(baseline);
	const poly = document.createElementNS(svgNS, 'polyline');
	poly.setAttribute('points', droxRegulationSparklinePoints(series, width, height));
	poly.setAttribute('class', 'drox-regulation-spark-line');
	svg.appendChild(poly);
	sparkWrap.appendChild(svg);
	dom.append(sparkWrap, dom.$('p.drox-codebase-muted', undefined, localize(
		'drox.regulation.charts.sparkHint',
		'{0} points · last {1}',
		String(series.length),
		String(Math.round(series[series.length - 1] ?? 0)),
	)));

	const breakdown = droxRegulationIssueBreakdown(history);
	const issues = dom.append(charts, dom.$('.drox-regulation-issues'));
	dom.append(issues, dom.$('p.drox-regulation-chart-label', undefined, localize(
		'drox.regulation.charts.issues',
		'Issues',
	)));
	const bar = dom.append(issues, dom.$('.drox-regulation-issue-bar'));
	appendIssueSegment(bar, 'ok', breakdown.ok, breakdown.total);
	appendIssueSegment(bar, 'error', breakdown.error, breakdown.total);
	appendIssueSegment(bar, 'loop', breakdown.loop, breakdown.total);
	appendIssueSegment(bar, 'cancel', breakdown.cancel, breakdown.total);

	const legend = dom.append(issues, dom.$('.drox-regulation-issue-legend'));
	for (const kind of ['ok', 'error', 'loop', 'cancel'] as const) {
		const n = breakdown[kind];
		if (n <= 0) {
			continue;
		}
		const item = dom.append(legend, dom.$('span.drox-regulation-issue-legend-item'));
		item.classList.add(`is-${kind}`);
		item.textContent = `${kind} ${n}`;
	}
}

function appendIssueSegment(bar: HTMLElement, kind: DroxRegulationRunIssue, count: number, total: number): void {
	if (count <= 0 || total <= 0) {
		return;
	}
	const seg = dom.append(bar, dom.$('span.drox-regulation-issue-seg'));
	seg.classList.add(`is-${kind}`);
	seg.style.flexGrow = String(count);
	seg.title = `${kind}: ${count}`;
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
