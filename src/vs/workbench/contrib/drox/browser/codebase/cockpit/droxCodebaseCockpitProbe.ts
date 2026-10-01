/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { localize } from '../../../../../../nls.js';
import { IDroxCodebaseHit } from '../../../common/codebase/droxCodebaseTypes.js';

export interface IDroxCodebaseCockpitProbeRenderResult {
	readonly input: HTMLInputElement;
	readonly results: HTMLElement;
}

export function renderDroxCodebaseCockpitProbe(
	parent: HTMLElement,
	opts: {
		readonly mode: 'lexical' | 'hybrid';
		readonly prevQuery: string;
		readonly onProbe: () => void;
	},
): IDroxCodebaseCockpitProbeRenderResult {
	const probe = dom.append(parent, dom.$('.drox-codebase-section'));
	dom.append(probe, dom.$('h4', undefined, opts.mode === 'hybrid'
		? localize('drox.codebase.probeHybrid', 'Hybrid probe')
		: localize('drox.codebase.probe', 'Lexical probe')));
	const input = dom.append(probe, dom.$('input.drox-codebase-probe-input')) as HTMLInputElement;
	input.type = 'text';
	input.placeholder = localize('drox.codebase.probePlaceholder', 'e.g. checkout branch');
	input.value = opts.prevQuery;
	const probeBtn = dom.append(probe, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
	probeBtn.textContent = localize('drox.codebase.runProbe', 'Probe');
	probeBtn.onclick = () => opts.onProbe();
	const results = dom.append(probe, dom.$('.drox-codebase-probe-results'));
	return { input, results };
}

export function renderDroxCodebaseCockpitHits(container: HTMLElement, hits: readonly IDroxCodebaseHit[]): void {
	dom.clearNode(container);
	if (!hits.length) {
		dom.append(container, dom.$('p.drox-codebase-muted', undefined, localize('drox.codebase.noHits', 'No hits')));
		return;
	}
	for (const hit of hits) {
		const row = dom.append(container, dom.$('div.drox-codebase-hit'));
		dom.append(row, dom.$('p', undefined, `${hit.path}:${hit.startLine}-${hit.endLine} (score ${hit.score})`));
		dom.append(row, dom.$('pre.drox-codebase-preview', undefined, hit.preview));
	}
}
