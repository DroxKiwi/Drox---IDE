/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { localize } from '../../../../../../nls.js';
import { DROX_EMBED_DEFAULT_MODEL_ID, DROX_EMBED_DEFAULT_MODEL_LABEL } from '../../../common/codebase/droxCodebaseEmbedPaths.js';
import { IDroxCodebaseEmbedStats } from '../../../common/codebase/droxCodebaseTypes.js';

/** Soft visual ceiling for the RSS bar (not a hard limit). */
const EMBED_RSS_BAR_SOFT_CAP_BYTES = 512 * 1024 * 1024;

export interface IDroxCodebaseCockpitEmbedRenderResult {
	readonly pathInput: HTMLInputElement;
}

export function renderDroxCodebaseCockpitEmbed(
	parent: HTMLElement,
	opts: {
		readonly embed: IDroxCodebaseEmbedStats;
		readonly mode: 'lexical' | 'hybrid';
		readonly prevEmbedPath: string | undefined;
		readonly onApplyPath: (path: string) => void;
		readonly onResetDefaults: () => void;
	},
): IDroxCodebaseCockpitEmbedRenderResult {
	const section = dom.append(parent, dom.$('.drox-codebase-section'));
	dom.append(section, dom.$('h4', undefined, localize('drox.codebase.embed', 'Embed')));

	const callout = dom.append(section, dom.$('.drox-codebase-embed-callout'));
	dom.append(callout, dom.$('p.drox-codebase-embed-callout-title', undefined, localize(
		'drox.codebase.embedWhatTitle',
		'What MiniLM does (visible by design)',
	)));
	const list = dom.append(callout, dom.$('ul.drox-codebase-embed-facts'));
	const facts = [
		localize('drox.codebase.embedFact1', 'Turns each code chunk into a vector so search can match meaning, not only exact words.'),
		localize('drox.codebase.embedFact2', 'Runs locally in drox.exe (llama.cpp) — no cloud upload of your codebase for embeddings.'),
		localize('drox.codebase.embedFact3', 'Default model: {0} — small (~20 Mo), ~384 dimensions, embedding GGUF (not a chat LLM).', DROX_EMBED_DEFAULT_MODEL_LABEL),
		localize('drox.codebase.embedFact4', 'Used at Reindex (encode chunks) and at Probe (encode your query), then fused with lexical hits.'),
	];
	for (const fact of facts) {
		dom.append(list, dom.$('li', undefined, fact));
	}

	const sourceLabel = sourceLabelFor(opts.embed.source);
	dom.append(section, dom.$('p', undefined, opts.embed.loaded
		? localize('drox.codebase.embedLoaded', 'Loaded ({0})', opts.embed.modelId ?? '?')
		: localize('drox.codebase.embedNotLoaded', 'Not loaded — {0}', opts.mode === 'hybrid' ? 'hybrid ready' : 'lexical only')));
	dom.append(section, dom.$('p', undefined, localize('drox.codebase.mode', 'Retrieval mode: {0}', opts.mode)));
	dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
		'drox.codebase.embedSource',
		'Active source: {0}',
		sourceLabel,
	)));
	if (opts.embed.resolvedPath) {
		dom.append(section, dom.$('p.drox-codebase-muted', undefined, opts.embed.resolvedPath));
	}
	if (opts.embed.dimensions) {
		dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
			'drox.codebase.embedDims',
			'Dimensions: {0} · backend: {1}',
			String(opts.embed.dimensions),
			opts.embed.backend ?? '?',
		)));
	}

	renderEmbedResources(section, opts.embed);

	dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
		'drox.codebase.embedFormatHint',
		'Custom override: absolute path to an embedding GGUF (e.g. MiniLM / BGE-small). Chat models will not work here. File name default: {0}',
		DROX_EMBED_DEFAULT_MODEL_ID,
	)));

	const pathInput = dom.append(section, dom.$('input.drox-codebase-probe-input')) as HTMLInputElement;
	pathInput.type = 'text';
	pathInput.placeholder = localize('drox.codebase.embedPathPlaceholder', 'Optional custom GGUF path…');
	pathInput.value = opts.prevEmbedPath ?? opts.embed.customPathSetting ?? '';

	const embedActions = dom.append(section, dom.$('.drox-codebase-actions'));
	const applyBtn = dom.append(embedActions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
	applyBtn.textContent = localize('drox.codebase.embedApplyPath', 'Use this GGUF');
	applyBtn.onclick = () => opts.onApplyPath(pathInput.value);

	const resetBtn = dom.append(embedActions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
	resetBtn.textContent = localize('drox.codebase.embedResetDefaults', 'Reset to defaults');
	resetBtn.title = localize(
		'drox.codebase.embedResetDefaultsTitle',
		'Clear custom path and reload the bundled MiniLM shipped with Drox.',
	);
	resetBtn.onclick = () => {
		pathInput.value = '';
		opts.onResetDefaults();
	};

	return { pathInput };
}

function renderEmbedResources(section: HTMLElement, embed: IDroxCodebaseEmbedStats): void {
	const box = dom.append(section, dom.$('.drox-codebase-embed-resources'));
	dom.append(box, dom.$('p.drox-codebase-embed-resources-title', undefined, localize(
		'drox.codebase.embedResources',
		'Live resources (drox.exe)',
	)));

	const rss = embed.rssBytes;
	const pct = typeof rss === 'number'
		? Math.min(100, Math.round((rss / EMBED_RSS_BAR_SOFT_CAP_BYTES) * 100))
		: 0;
	const bar = dom.append(box, dom.$('.drox-codebase-embed-ram-bar'));
	const fill = dom.append(bar, dom.$('.drox-codebase-embed-ram-bar-fill')) as HTMLElement;
	fill.style.width = `${pct}%`;
	if (embed.loaded) {
		fill.classList.add('is-loaded');
	}

	const rssLabel = typeof rss === 'number'
		? localize('drox.codebase.embedRss', 'RSS: {0}', formatBytesShort(rss))
		: localize('drox.codebase.embedRssUnknown', 'RSS: unavailable — rebuild drox.exe to report process memory');
	dom.append(box, dom.$('p.drox-codebase-muted', undefined, rssLabel));

	const disk = typeof embed.modelFileBytes === 'number'
		? localize('drox.codebase.embedDisk', 'GGUF on disk: {0}', formatBytesShort(embed.modelFileBytes))
		: localize('drox.codebase.embedDiskMissing', 'GGUF on disk: —');
	const resident = embed.loaded
		? localize('drox.codebase.embedResidentYes', 'Model resident in process')
		: (embed.built
			? localize('drox.codebase.embedResidentNo', 'Model not loaded in process')
			: localize('drox.codebase.embedResidentNotBuilt', 'Embed runtime not in this binary'));
	dom.append(box, dom.$('p.drox-codebase-muted', undefined, `${disk} · ${resident}`));
	dom.append(box, dom.$('p.drox-codebase-muted', undefined, localize(
		'drox.codebase.embedRssHint',
		'Bar soft-cap {0} (visual only). Polls while this view is open.',
		formatBytesShort(EMBED_RSS_BAR_SOFT_CAP_BYTES),
	)));
}

export function formatBytesShort(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) {
		return '—';
	}
	if (bytes < 1024) {
		return `${Math.round(bytes)} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KiB`;
	}
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
	}
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

function sourceLabelFor(source: IDroxCodebaseEmbedStats['source']): string {
	switch (source) {
		case 'custom':
			return localize('drox.codebase.source.custom', 'custom path (your override)');
		case 'env':
			return localize('drox.codebase.source.env', 'DROX_EMBED_MODEL_PATH (env)');
		case 'bundled':
			return localize('drox.codebase.source.bundled', 'bundled with the app (default MiniLM)');
		case 'userData':
			return localize('drox.codebase.source.userData', 'userData/drox/models');
		case 'repo':
			return localize('drox.codebase.source.repo', 'dev repo drox-engine/models');
		case 'missing':
			return localize('drox.codebase.source.missing', 'missing — package MiniLM or set a path');
		default:
			return localize('drox.codebase.source.unknown', 'unknown');
	}
}
