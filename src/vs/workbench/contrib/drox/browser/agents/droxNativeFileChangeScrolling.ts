/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { IMouseWheelEvent } from '../../../../../base/browser/mouseEvent.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';

const FC_DIFF_SELECTOR = '.drox-native-file-change .fc-diff';

function findScrollableDiff(target: EventTarget | null): HTMLElement | undefined {
	if (!target || !(target instanceof Node)) {
		return undefined;
	}
	const el = target instanceof HTMLElement ? target : target.parentElement;
	return el?.closest(FC_DIFF_SELECTOR) ?? undefined;
}

function diffCanScrollVertically(diffEl: HTMLElement): boolean {
	return diffEl.scrollHeight - diffEl.clientHeight > 1;
}

function shouldIsolateWheelFromChat(diffEl: HTMLElement, deltaY: number): boolean {
	if (!diffCanScrollVertically(diffEl)) {
		return false;
	}
	if (deltaY < 0) {
		return diffEl.scrollTop > 0;
	}
	if (deltaY > 0) {
		return diffEl.scrollTop + diffEl.clientHeight < diffEl.scrollHeight - 1;
	}
	return false;
}

/**
 * Empêche le fil chat parent de voler la molette quand `.fc-diff` peut encore scroller.
 * Le scroll natif (`overflow: auto`) reste inchangé — on bloque seulement la propagation.
 */
export function installDroxFileChangeWheelScrollIsolation(container: HTMLElement): IDisposable {
	return dom.addDisposableListener(container, dom.EventType.MOUSE_WHEEL, (e: IMouseWheelEvent) => {
		const diffEl = findScrollableDiff(e.target);
		if (!diffEl || !shouldIsolateWheelFromChat(diffEl, e.deltaY)) {
			return;
		}
		e.stopPropagation();
	}, { capture: true });
}
