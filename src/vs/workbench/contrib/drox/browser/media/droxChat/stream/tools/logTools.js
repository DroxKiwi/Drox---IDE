/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.getLogMountParent = function () {
		return D.dom.logEl;
	};

	fn.createToolBlock = function (payload) {
		const details = document.createElement('details');
		details.className = 'msg-tool msg-ai-frame running drox-log-indent';
		details.open = false;
		const summary = document.createElement('summary');
		const verb = String(payload.verb ?? 'Ran');
		const target = String(payload.target ?? '');
		summary.innerHTML = `<strong>${verb}</strong>${target ? ` <span class="tool-target">${target}</span>` : ''}`;
		const body = document.createElement('div');
		body.className = 'msg-tool-body';
		if (payload.argsPreview) {
			const pre = document.createElement('pre');
			pre.textContent = payload.argsPreview;
			body.appendChild(pre);
		}
		details.appendChild(summary);
		details.appendChild(body);
		const parent = fn.getLogMountParent();
		const preview = summary.innerHTML;
		if (fn.shouldUseCollapsibleToolTray?.(parent)) {
			fn.mountToolBlockInTray?.(parent, details, preview);
		} else {
			parent.appendChild(details);
		}
		fn.syncPhaseBlockSummary?.(D.state.streamPhaseBlockEl);
		fn.scrollLog();
		return details;
	};

	fn.finishToolBlock = function (block, payload) {
		block.classList.remove('running');
		block.open = false;
		if (payload.isError) {
			block.classList.add('error');
			fn.markChatIssueElement?.(block);
		}
		const body = block.querySelector('.msg-tool-body');
		if (body && payload.outputPreview) {
			const pre = document.createElement('pre');
			pre.textContent = payload.outputPreview;
			body.appendChild(pre);
		}
		const toolSummary = block.querySelector('summary');
		if (toolSummary && block.parentElement?.classList?.contains('drox-collapsible-tray-inner')) {
			const trayInner = block.parentElement;
			const trayDetails = trayInner.closest('details');
			if (trayDetails) {
				const traySummary = trayDetails.querySelector(':scope > summary');
				if (traySummary) {
					fn.stripActivityGridsFromElement?.(toolSummary);
					traySummary.innerHTML = toolSummary.innerHTML;
					const n = trayInner.childElementCount;
					traySummary.title =
						n <= 1 ? '1 tool — click for history' : `${n} tools — click for full history`;
				}
			}
		}
		fn.syncPhaseBlockSummary?.(D.state.streamPhaseBlockEl);
		fn.scrollLog();
	};
})(globalThis.DroxChat);
