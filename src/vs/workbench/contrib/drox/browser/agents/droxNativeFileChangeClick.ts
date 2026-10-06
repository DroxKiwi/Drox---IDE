/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Clic sur le texte du chemin → `e.target` est souvent un Text node, pas un Element. */
export function eventTargetElement(from: EventTarget | null): Element | null {
	if (from instanceof Element) {
		return from;
	}
	if (from instanceof Node) {
		return from.parentElement;
	}
	return null;
}

export function resolveFileChangeOpenTarget(from: EventTarget | null): { path: string; toolId?: string } | undefined {
	const el = eventTargetElement(from);
	if (!el) {
		return undefined;
	}
	const card = el.closest('.drox-native-file-change');
	if (!card) {
		return undefined;
	}
	// Undo / Redo keep their own command: links.
	if (el.closest('.fc-undo, .fc-redo, .fc-actions')) {
		return undefined;
	}
	// Open on path click, or on the summary row (op / icon / stats) — not the diff body.
	const onPath = !!el.closest('.fc-path');
	const inSummary = !!el.closest('.fc-summary');
	if (!onPath && !inSummary) {
		return undefined;
	}

	const pathEl = onPath
		? el.closest('.fc-path')
		: card.querySelector('.fc-path');
	const path =
		(pathEl instanceof HTMLElement
			? (pathEl.getAttribute('data-path') || pathEl.getAttribute('title') || pathEl.textContent || '')
			: '')
		|| card.getAttribute('data-path')
		|| '';
	const trimmed = path.trim();
	if (!trimmed) {
		return undefined;
	}
	const toolId =
		(pathEl instanceof HTMLElement ? pathEl.getAttribute('data-tool-id') : null)
		|| card.getAttribute('data-tool-id')
		|| undefined;
	return { path: trimmed, toolId: toolId?.trim() || undefined };
}
