/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;
	fn.isLogNearBottom = function (el, thresholdPx) {
		if (!el) {
			return true;
		}
		const threshold = typeof thresholdPx === 'number' ? thresholdPx : 56;
		return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
	};

	fn.bindThinkingScrollEl = function (el) {
		if (!el || el.dataset.thinkingScrollBound === '1') {
			return;
		}
		el.dataset.thinkingScrollBound = '1';
		D.state.thinkingScrollStick.set(el, true);
		el.addEventListener(
			'scroll',
			() => {
				D.state.thinkingScrollStick.set(el, fn.isLogNearBottom(el, 28));
			},
			{ passive: true },
		);
	};

	fn.scrollThinkingEl = function (el, force) {
		if (!el) {
			return;
		}
		requestAnimationFrame(() => {
			const stick = D.state.thinkingScrollStick.get(el);
			if (force === true || stick !== false) {
				el.scrollTop = el.scrollHeight;
			}
		});
	};

	fn.scrollLog = function (force) {
		requestAnimationFrame(() => {
			const el = D.dom.logEl;
			if (!el) {
				return;
			}
			if (force === true || D.state.logStickToBottom) {
				el.scrollTop = el.scrollHeight;
			}
		});
	}

})(globalThis.DroxChat);
