/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../../base/browser/dom.js';
import { localize } from '../../../../../../nls.js';
import { IDroxCodebaseCatalog, IDroxCodebaseCatalogFile } from '../../../common/codebase/droxCodebaseCatalog.js';

export interface IDroxCodebaseCockpitCatalogHandlers {
	readonly onDelete: (paths: readonly string[]) => void;
	readonly onExclude: (paths: readonly string[]) => void;
	readonly onRebuild: (paths: readonly string[]) => void;
	readonly onCompact: () => void;
	readonly onRefresh: () => void;
	readonly onAddExclusionGlob: (glob: string) => void;
	readonly onRemoveExclusionGlob: (glob: string) => void;
}

/**
 * CB3b — browse / delete / exclude / rebuild / compact indexed knowledge in the cockpit.
 */
export function renderDroxCodebaseCockpitCatalog(
	parent: HTMLElement,
	catalog: IDroxCodebaseCatalog | undefined,
	busy: boolean,
	handlers: IDroxCodebaseCockpitCatalogHandlers,
	opts?: {
		readonly expandedPaths?: ReadonlySet<string>;
		readonly selectedPaths?: ReadonlySet<string>;
		readonly exclusionGlobs?: readonly string[];
		readonly lastCompactMsg?: string;
		readonly onToggleExpand?: (path: string) => void;
		readonly onToggleSelect?: (path: string) => void;
	},
): HTMLElement {
	const section = dom.append(parent, dom.$('.drox-codebase-section.drox-codebase-catalog'));
	dom.append(section, dom.$('h4', undefined, localize('drox.codebase.catalog', 'Knowledge catalogue')));

	const actions = dom.append(section, dom.$('.drox-codebase-actions'));
	const refreshBtn = dom.append(actions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
	refreshBtn.textContent = localize('drox.codebase.catalogRefresh', 'Refresh');
	refreshBtn.disabled = busy;
	refreshBtn.onclick = () => handlers.onRefresh();

	const compactBtn = dom.append(actions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
	compactBtn.textContent = localize('drox.codebase.catalogCompact', 'Compact');
	compactBtn.disabled = busy || !catalog || catalog.totalFiles === 0;
	compactBtn.onclick = () => handlers.onCompact();

	const selectedCount = opts?.selectedPaths?.size ?? 0;
	const selected = () => opts?.selectedPaths ? [...opts.selectedPaths] : [];

	const deleteBtn = dom.append(actions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
	deleteBtn.textContent = selectedCount
		? localize('drox.codebase.catalogDeleteN', 'Delete ({0})', String(selectedCount))
		: localize('drox.codebase.catalogDelete', 'Delete selected');
	deleteBtn.disabled = busy || selectedCount === 0;
	deleteBtn.onclick = () => handlers.onDelete(selected());

	const excludeBtn = dom.append(actions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
	excludeBtn.textContent = selectedCount
		? localize('drox.codebase.catalogExcludeN', 'Exclude ({0})', String(selectedCount))
		: localize('drox.codebase.catalogExclude', 'Exclude selected');
	excludeBtn.title = localize('drox.codebase.catalogExcludeTitle', 'Remove from index and never reindex these paths');
	excludeBtn.disabled = busy || selectedCount === 0;
	excludeBtn.onclick = () => handlers.onExclude(selected());

	const rebuildBtn = dom.append(actions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
	rebuildBtn.textContent = selectedCount
		? localize('drox.codebase.catalogRebuildN', 'Rebuild ({0})', String(selectedCount))
		: localize('drox.codebase.catalogRebuild', 'Rebuild selected');
	rebuildBtn.title = localize('drox.codebase.catalogRebuildTitle', 'Re-chunk and re-embed selected paths only');
	rebuildBtn.disabled = busy || selectedCount === 0;
	rebuildBtn.onclick = () => handlers.onRebuild(selected());

	if (opts?.lastCompactMsg) {
		dom.append(section, dom.$('p.drox-codebase-muted', undefined, opts.lastCompactMsg));
	}

	renderExclusionsBlock(section, busy, handlers, opts?.exclusionGlobs ?? []);

	if (!catalog) {
		dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
			'drox.codebase.catalogLoading',
			'Loading catalogue…',
		)));
		return section;
	}

	if (catalog.totalFiles === 0) {
		dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
			'drox.codebase.catalogEmpty',
			'No indexed files — Reindex first.',
		)));
		return section;
	}

	dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
		'drox.codebase.catalogStats',
		'{0} files · {1} chunks · {2} with vectors · {3} text bytes',
		String(catalog.totalFiles),
		String(catalog.totalChunks),
		String(catalog.totalVectors),
		String(catalog.textBytes),
	)));

	const list = dom.append(section, dom.$('.drox-codebase-catalog-list'));
	for (const file of catalog.files) {
		renderCatalogFileRow(list, file, busy, opts);
	}

	return section;
}

function renderExclusionsBlock(
	section: HTMLElement,
	busy: boolean,
	handlers: IDroxCodebaseCockpitCatalogHandlers,
	globs: readonly string[],
): void {
	dom.append(section, dom.$('h4', undefined, localize('drox.codebase.exclusions', 'Exclusions')));
	dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
		'drox.codebase.exclusionsHint',
		'Globs / paths that stay out of the index (persisted in .drox/codebase-index/exclusions.json).',
	)));

	const addRow = dom.append(section, dom.$('.drox-codebase-actions'));
	const input = dom.append(addRow, dom.$('input.drox-codebase-probe-input')) as HTMLInputElement;
	input.placeholder = localize('drox.codebase.exclusionPlaceholder', 'e.g. **/fixtures/** or docs/exports/**');
	input.disabled = busy;
	const addBtn = dom.append(addRow, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
	addBtn.textContent = localize('drox.codebase.exclusionAdd', 'Add glob');
	addBtn.disabled = busy;
	const submit = () => {
		const g = input.value.trim();
		if (g) {
			handlers.onAddExclusionGlob(g);
			input.value = '';
		}
	};
	addBtn.onclick = () => submit();
	input.onkeydown = e => {
		if (e.key === 'Enter') {
			e.preventDefault();
			submit();
		}
	};

	if (!globs.length) {
		dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
			'drox.codebase.exclusionsEmpty',
			'No exclusions yet.',
		)));
		return;
	}

	const list = dom.append(section, dom.$('.drox-codebase-exclusion-list'));
	for (const g of globs) {
		const row = dom.append(list, dom.$('.drox-codebase-exclusion-row'));
		dom.append(row, dom.$('span.drox-codebase-catalog-path', undefined, g));
		const rm = dom.append(row, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
		rm.textContent = localize('drox.codebase.exclusionRemove', 'Remove');
		rm.disabled = busy;
		rm.onclick = () => handlers.onRemoveExclusionGlob(g);
	}
}

function renderCatalogFileRow(
	parent: HTMLElement,
	file: IDroxCodebaseCatalogFile,
	busy: boolean,
	opts?: {
		readonly expandedPaths?: ReadonlySet<string>;
		readonly selectedPaths?: ReadonlySet<string>;
		readonly onToggleExpand?: (path: string) => void;
		readonly onToggleSelect?: (path: string) => void;
	},
): void {
	const row = dom.append(parent, dom.$('.drox-codebase-catalog-file'));
	const head = dom.append(row, dom.$('.drox-codebase-catalog-file-head'));

	const check = dom.append(head, dom.$('input')) as HTMLInputElement;
	check.type = 'checkbox';
	check.checked = !!opts?.selectedPaths?.has(file.path);
	check.disabled = busy;
	check.onchange = () => opts?.onToggleSelect?.(file.path);

	const expand = dom.append(head, dom.$('button.drox-codebase-catalog-expand')) as HTMLButtonElement;
	const expanded = !!opts?.expandedPaths?.has(file.path);
	expand.textContent = expanded ? 'v' : '>';
	expand.title = localize('drox.codebase.catalogExpand', 'Show chunks');
	expand.disabled = busy;
	expand.onclick = () => opts?.onToggleExpand?.(file.path);

	dom.append(head, dom.$('span.drox-codebase-catalog-path', undefined, file.path));
	dom.append(head, dom.$('span.drox-codebase-muted', undefined, localize(
		'drox.codebase.catalogFileMeta',
		'{0} chunks · {1} vec · {2} B',
		String(file.chunkCount),
		String(file.vectorCount),
		String(file.textBytes),
	)));

	if (expanded) {
		const chunks = dom.append(row, dom.$('.drox-codebase-catalog-chunks'));
		for (const c of file.chunks) {
			const line = dom.append(chunks, dom.$('.drox-codebase-catalog-chunk'));
			dom.append(line, dom.$('span.drox-codebase-muted', undefined, `L${c.startLine}-${c.endLine}${c.hasVector ? ' · vec' : ''}`));
			dom.append(line, dom.$('p.drox-codebase-preview', undefined, c.preview));
		}
	}
}
