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

	/** Pas de suivi auto pendant un run — l'utilisateur garde la main sur le fil. */
	fn.shouldAutoScrollLog = function () {
		return !D.state.busy;
	};

	/** Scroll explicite (ex. message user envoyé) — ignore `busy`. */
	fn.scrollLogToEnd = function () {
		requestAnimationFrame(() => {
			const el = D.dom.logEl;
			if (el) {
				el.scrollTop = el.scrollHeight;
			}
		});
	};

	fn.scrollLog = function (force) {
		if (!fn.shouldAutoScrollLog()) {
			return;
		}
		requestAnimationFrame(() => {
			const el = D.dom.logEl;
			if (!el) {
				return;
			}
			if (force === true || D.state.logStickToBottom) {
				el.scrollTop = el.scrollHeight;
			}
		});
	};
})(globalThis.DroxChat);
