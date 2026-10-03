/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { localize } from '../../../../../../nls.js';
import { IDroxCodebasePipelineEvent, IDroxCodebasePipelineStage } from '../../../common/codebase/droxCodebaseTypes.js';

export interface IDroxCodebaseCockpitPipelineRenderResult {
	readonly logEl: HTMLElement;
}

export function renderDroxCodebaseCockpitPipeline(
	parent: HTMLElement,
	opts: {
		readonly stages: readonly IDroxCodebasePipelineStage[];
		readonly events: readonly IDroxCodebasePipelineEvent[];
		readonly progressPct: number;
		readonly currentMessage: string | undefined;
		readonly trigger: string | undefined;
		readonly onExport: () => void;
		readonly onClear: () => void;
	},
): IDroxCodebaseCockpitPipelineRenderResult {
	const section = dom.append(parent, dom.$('.drox-codebase-section.drox-codebase-pipeline'));
	dom.append(section, dom.$('h4', undefined, localize('drox.codebase.pipeline', 'Vectorization pipeline')));
	dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
		'drox.codebase.pipelineHint',
		'Live steps from the local engine (scan → chunk → embed → write). Use Export to share a debug dump.',
	)));
	if (opts.trigger || opts.currentMessage) {
		dom.append(section, dom.$('p', undefined, [
			opts.trigger ? localize('drox.codebase.pipelineTrigger', 'Trigger: {0}', opts.trigger) : '',
			opts.currentMessage ?? '',
		].filter(Boolean).join(' · ')));
	}

	const stagesRow = dom.append(section, dom.$('.drox-codebase-pipeline-stages'));
	for (const stage of opts.stages) {
		const chip = dom.append(stagesRow, dom.$(`.drox-codebase-pipeline-stage.is-${stage.state}`));
		dom.append(chip, dom.$('span.drox-codebase-pipeline-stage-dot'));
		dom.append(chip, dom.$('span', undefined, stage.label));
	}

	const bar = dom.append(section, dom.$('.drox-codebase-pipeline-bar'));
	const fill = dom.append(bar, dom.$('.drox-codebase-pipeline-bar-fill')) as HTMLElement;
	fill.style.width = `${Math.max(0, Math.min(100, opts.progressPct))}%`;
	dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
		'drox.codebase.pipelineProgress',
		'Progress: {0}%',
		String(Math.round(opts.progressPct)),
	)));

	const actions = dom.append(section, dom.$('.drox-codebase-actions'));
	const exportBtn = dom.append(actions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
	exportBtn.textContent = localize('drox.codebase.exportDiag', 'Export diag');
	exportBtn.title = localize('drox.codebase.exportDiagTitle', 'Copy JSON to clipboard and write diag-export-*.json under .drox/codebase-index');
	exportBtn.onclick = () => opts.onExport();

	const clearBtn = dom.append(actions, dom.$('button.drox-codebase-btn.drox-codebase-btn-ghost')) as HTMLButtonElement;
	clearBtn.textContent = localize('drox.codebase.clearPipeline', 'Clear log');
	clearBtn.onclick = () => opts.onClear();

	const logEl = dom.append(section, dom.$('.drox-codebase-pipeline-log'));
	const recent = opts.events.slice(-80);
	if (!recent.length) {
		dom.append(logEl, dom.$('p.drox-codebase-muted', undefined, localize(
			'drox.codebase.pipelineEmpty',
			'No steps yet — open a folder or click Reindex.',
		)));
		return { logEl };
	}
	for (const ev of recent) {
		const row = dom.append(logEl, dom.$(`.drox-codebase-pipeline-event.is-${ev.status}`));
		const time = new Date(ev.at).toLocaleTimeString();
		const pathBit = ev.path ? ` · ${ev.path}` : '';
		dom.append(row, dom.$('span.drox-codebase-pipeline-event-meta', undefined, `${time} · ${ev.kind}`));
		dom.append(row, dom.$('span.drox-codebase-pipeline-event-msg', undefined, `${ev.message}${pathBit}`));
	}
	return { logEl };
}
