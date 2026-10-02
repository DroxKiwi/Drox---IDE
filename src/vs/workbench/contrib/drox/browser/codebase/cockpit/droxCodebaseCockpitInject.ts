/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { localize } from '../../../../../../nls.js';
import { IDroxCodebaseLastInject } from '../../../common/codebase/droxCodebaseTypes.js';
import { renderDroxCodebaseCockpitHits } from './droxCodebaseCockpitProbe.js';

/**
 * Live CB4 inject strip — shows what the last agent.run packed into system.
 */
export function renderDroxCodebaseCockpitInject(
	parent: HTMLElement,
	opts: {
		readonly lastInject: IDroxCodebaseLastInject | undefined;
		readonly autoEnabled: boolean;
		readonly forceArmed: boolean;
		readonly onToggleAuto?: () => void;
	},
): void {
	const section = dom.append(parent, dom.$('.drox-codebase-section.drox-codebase-inject'));
	dom.append(section, dom.$('h4', undefined, localize('drox.codebase.inject.title', 'Last auto-inject')));

	const badges = dom.append(section, dom.$('.drox-codebase-inject-badges'));
	const autoBtn = dom.append(badges, dom.$('button.drox-codebase-inject-badge')) as HTMLButtonElement;
	autoBtn.type = 'button';
	autoBtn.classList.add(opts.autoEnabled ? 'is-ok' : 'is-muted', 'is-toggle');
	autoBtn.textContent = opts.autoEnabled
		? localize('drox.codebase.inject.autoOn', 'Auto ON')
		: localize('drox.codebase.inject.autoOff', 'Auto OFF');
	autoBtn.title = localize(
		'drox.codebase.inject.autoToggleTitle',
		'Toggle auto-inject of @Codebase context into agent runs (setting drox.codebase.autoInject)',
	);
	autoBtn.disabled = !opts.onToggleAuto;
	if (opts.onToggleAuto) {
		autoBtn.onclick = () => opts.onToggleAuto!();
	}
	if (opts.forceArmed) {
		appendBadge(badges, localize('drox.codebase.inject.forceArmed', 'Force armed'), 'is-warn');
	}

	const rec = opts.lastInject;
	if (!rec) {
		dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
			'drox.codebase.inject.empty',
			'No inject yet — send a chat message to populate.',
		)));
		return;
	}

	const modeLabel = rec.forced
		? localize('drox.codebase.inject.forced', 'Forced')
		: localize('drox.codebase.inject.auto', 'Auto');
	const skipLabel = skipText(rec.skip);
	const summary = skipLabel
		? localize(
			'drox.codebase.inject.summarySkip',
			'{0} · {1} · {2} ms · {3}',
			modeLabel,
			skipLabel,
			String(rec.ms),
			formatInjectAge(rec.at),
		)
		: localize(
			'drox.codebase.inject.summaryOk',
			'{0} · {1} hits · {2} chars · {3} ms · {4}',
			modeLabel,
			String(rec.hitCount),
			String(rec.chars),
			String(rec.ms),
			formatInjectAge(rec.at),
		);

	const callout = dom.append(section, dom.$('.drox-codebase-inject-callout'));
	callout.classList.toggle('is-forced', rec.forced);
	callout.classList.toggle('is-skip', !!rec.skip);
	callout.classList.toggle('is-ok', !rec.skip && rec.hitCount > 0);
	dom.append(callout, dom.$('p.drox-codebase-inject-summary', undefined, summary));
	if (rec.query) {
		dom.append(callout, dom.$('p.drox-codebase-muted', undefined, localize(
			'drox.codebase.inject.query',
			'Query: {0}',
			rec.query.length > 120 ? `${rec.query.slice(0, 118)}…` : rec.query,
		)));
	}
	if (rec.forcePathPrefixes?.length) {
		dom.append(callout, dom.$('p.drox-codebase-muted', undefined, localize(
			'drox.codebase.inject.forcePaths',
			'Force paths: {0}',
			rec.forcePathPrefixes.join(', '),
		)));
	}

	const results = dom.append(section, dom.$('.drox-codebase-inject-hits'));
	if (rec.hits.length) {
		renderDroxCodebaseCockpitHits(results, rec.hits);
	} else if (!rec.skip) {
		dom.append(results, dom.$('p.drox-codebase-muted', undefined, localize('drox.codebase.noHits', 'No hits')));
	}
}

function appendBadge(parent: HTMLElement, text: string, cls: string): void {
	const badge = dom.append(parent, dom.$('span.drox-codebase-inject-badge'));
	badge.classList.add(cls);
	badge.textContent = text;
}

function skipText(skip: IDroxCodebaseLastInject['skip']): string | undefined {
	switch (skip) {
		case 'disabled':
			return localize('drox.codebase.inject.skipDisabled', 'pack skipped (auto off)');
		case 'empty_query':
			return localize('drox.codebase.inject.skipEmpty', 'empty query');
		case 'timeout':
			return localize('drox.codebase.inject.skipTimeout', 'search timeout');
		case 'no_hits':
			return localize('drox.codebase.inject.skipNoHits', 'no hits');
		case 'model_skip':
			return localize('drox.codebase.inject.skipModel', 'model skipRetrieval');
		case 'error':
			return localize('drox.codebase.inject.skipError', 'search error');
		default:
			return undefined;
	}
}

function formatInjectAge(at: number): string {
	const sec = Math.max(0, Math.round((Date.now() - at) / 1000));
	if (sec < 5) {
		return localize('drox.codebase.inject.justNow', 'just now');
	}
	if (sec < 60) {
		return localize('drox.codebase.inject.secsAgo', '{0}s ago', String(sec));
	}
	const min = Math.round(sec / 60);
	return localize('drox.codebase.inject.minsAgo', '{0}m ago', String(min));
}
