/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IDroxFileChangePayload } from './droxFileChange.js';

const $ = dom.$;

export type DroxDiffDisplayRow =
	| { readonly kind: 'context' | 'add' | 'remove' | 'hunk'; readonly text: string }
	| { readonly kind: 'collapsed'; readonly lineCount: number; readonly hiddenLines: readonly string[] };

export function getDroxFileChangeOpLabel(change: IDroxFileChangePayload): string {
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

export interface DroxFileChangeCardOptions {
	readonly staticFoldBars?: boolean;
	readonly showDismiss?: boolean;
	readonly showSelect?: boolean;
	readonly selected?: boolean;
	readonly onDismiss?: () => void;
	readonly onSelectToggle?: (selected: boolean) => void;
	readonly onOpenPath?: (filePath: string) => void;
}

/** Même rendu DOM que la carte `msg-file-change` du fil chat natif. */
export function createDroxFileChangeCardElement(
	change: IDroxFileChangePayload,
	rows: readonly DroxDiffDisplayRow[],
	options?: DroxFileChangeCardOptions,
): HTMLElement {
	const extraClass = [
		!change.applied ? 'is-not-applied' : '',
		change.cancelled ? 'is-cancelled' : '',
	].filter(Boolean).join(' ');

	const card = $('div.drox-native-file-change.msg-file-change');
	if (extraClass) {
		card.classList.add(...extraClass.split(' '));
	}

	const summary = dom.append(card, $('div.fc-summary'));
	dom.append(summary, $('span.fc-icon')).textContent = '📄';
	dom.append(summary, $('span.fc-op')).textContent = getDroxFileChangeOpLabel(change);

	const filePath = change.path;
	const canOpen = !!options?.onOpenPath && !!filePath;
	const path = dom.append(summary, canOpen ? $('a.fc-path') : $('span.fc-path')) as HTMLElement;
	path.textContent = change.relPath || filePath || '?';
	path.title = filePath ?? '';
	if (canOpen) {
		const anchor = path as HTMLAnchorElement;
		anchor.href = '#';
		anchor.addEventListener('click', e => {
			e.preventDefault();
			e.stopPropagation();
			options.onOpenPath!(filePath);
		});
	}

	const added = Math.max(0, change.added ?? 0);
	const removed = Math.max(0, change.removed ?? 0);
	if (added > 0 || removed > 0) {
		const stats = dom.append(summary, $('span.fc-stats'));
		if (added > 0) {
			dom.append(stats, $('span.fc-add')).textContent = `+${added}`;
		}
		if (removed > 0) {
			dom.append(stats, $('span.fc-rem')).textContent = `-${removed}`;
		}
	}

	if (options?.showSelect || options?.showDismiss) {
		const actions = dom.append(summary, $('span.fc-actions'));
		if (options.showSelect) {
			const select = dom.append(actions, $('input.fc-select')) as HTMLInputElement;
			select.type = 'checkbox';
			select.checked = !!options.selected;
			select.title = localize('drox.changes.inline.selectChange', 'Select this change');
			select.addEventListener('click', e => e.stopPropagation());
			select.addEventListener('change', () => options.onSelectToggle?.(select.checked));
		}
		if (options.showDismiss) {
			const dismiss = dom.append(actions, $('button.fc-dismiss')) as HTMLButtonElement;
			dismiss.type = 'button';
			dismiss.title = localize('drox.changes.inline.dismissChange', 'Remove from Changes');
			dismiss.classList.add(...ThemeIcon.asClassNameArray(Codicon.close));
			dismiss.addEventListener('click', e => {
				e.stopPropagation();
				options.onDismiss?.();
			});
		}
	}

	const body = dom.append(card, $('div.fc-body'));
	const diffHost = dom.append(body, $('div.fc-diff'));
	appendDroxFileChangeDiffRows(diffHost, rows, options);

	return card;
}

export function appendDroxFileChangeDiffRows(
	container: HTMLElement,
	rows: readonly DroxDiffDisplayRow[],
	options?: DroxFileChangeCardOptions,
): void {
	const staticFoldBars = options?.staticFoldBars ?? false;
	for (const row of rows) {
		if (row.kind === 'collapsed') {
			const bar = dom.append(container, $('div.diff-line.diff-fold'));
			if (!staticFoldBars) {
				const icon = dom.append(bar, $('span.codicon.diff-fold-icon'));
				icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));
			}
			dom.append(bar, $('span')).textContent = row.lineCount === 1
				? localize('drox.changes.inline.unmodifiedSingular', '1 unmodified line')
				: localize('drox.changes.inline.unmodifiedPlural', '{0} unmodified lines', row.lineCount);

			if (!staticFoldBars) {
				const hidden = $('div');
				hidden.style.display = 'none';
				for (const hiddenLine of row.hiddenLines) {
					appendDroxFileChangeDiffLine(hidden, 'context', hiddenLine);
				}
				container.appendChild(hidden);

				const icon = bar.querySelector('.diff-fold-icon');
				bar.onclick = () => {
					const expanded = hidden.style.display !== 'none';
					hidden.style.display = expanded ? 'none' : '';
					icon?.classList.toggle('codicon-chevron-down', expanded);
					icon?.classList.toggle('codicon-chevron-up', !expanded);
				};
			}
			continue;
		}

		appendDroxFileChangeDiffLine(container, row.kind, row.text);
	}
}

function appendDroxFileChangeDiffLine(container: HTMLElement, kind: DroxDiffDisplayRow['kind'], text: string): void {
	if (kind === 'collapsed') {
		return;
	}
	const line = dom.append(container, $('div.diff-line'));
	line.classList.add(`diff-${kind === 'add' ? 'add' : kind === 'remove' ? 'rem' : kind === 'hunk' ? 'hunk' : 'ctx'}`);
	line.textContent = text;
}
