/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;
	const DEFAULT_NEAR_BOTTOM_PX = 56;

	fn.isLogNearBottom = function (el, thresholdPx) {
		if (!el) {
			return true;
		}
		const threshold = typeof thresholdPx === 'number' ? thresholdPx : DEFAULT_NEAR_BOTTOM_PX;
		return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
	};

	fn.syncLogStickToBottom = function () {
		D.state.logStickToBottom = fn.isLogNearBottom(D.dom.logEl);
	};

	/** Suit le fil uniquement si l'utilisateur est en bas (ou proche). */
	fn.scrollLog = function () {
		if (!D.state.logStickToBottom) {
			return;
		}
		requestAnimationFrame(() => {
			const el = D.dom.logEl;
			if (!el) {
				return;
			}
			el.scrollTop = el.scrollHeight;
		});
	};

	/** Scroll forcé en bas + ancrage « stick » (envoi user, rejeu session, etc.). */
	fn.pinLogToBottom = function () {
		D.state.logStickToBottom = true;
		requestAnimationFrame(() => {
			const el = D.dom.logEl;
			if (el) {
				el.scrollTop = el.scrollHeight;
			}
		});
	};

	/**
	 * @param {boolean | { force?: boolean }} [opts]
	 * Sans `force` : respecte `logStickToBottom`. Avec `force` : équivaut à `pinLogToBottom`.
	 */
	fn.scrollLogToEnd = function (opts) {
		const force = opts === true || (opts && opts.force === true);
		if (force) {
			fn.pinLogToBottom();
			return;
		}
		fn.scrollLog();
	};
})(globalThis.DroxChat);
