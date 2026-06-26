/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.handleToolEvent = function(payload) {
		const id = String(payload.id ?? '');
		if (payload.phase === 'start') {
			fn.finalizeAssistant();
			const name = String(payload.name ?? '');
			D.state.pendingToolName = name;
			const verb = String(payload.verb ?? 'Ran');
			const target = String(payload.target ?? '');
			const details = fn.createToolBlock({
				...payload,
				name: String(payload.name ?? ''),
			});
			const toolSummary = details.querySelector('summary');
			if (D.state.busy && toolSummary) {
				fn.showActivityOnSummary(toolSummary);
			}
			if (id) {
				D.state.toolBlocks.set(id, details);
			}
			fn.syncWorkSummaryStats?.(D.state.runStripEl);
			fn.scrollLog();
			return;
		}
		if (payload.phase === 'finish') {
			const finishName = String(payload.name ?? D.state.pendingToolName ?? '');
			D.state.pendingToolName = '';
			fn.finalizeAssistant();
			const existing = id ? D.state.toolBlocks.get(id) : undefined;
			if (existing) {
				fn.finishToolBlock(existing, payload);
				D.state.toolBlocks.delete(id);
			}
			if (D.state.busy) {
				fn.showActivityOnCurrentPhaseSummary();
			} else if (D.state.pendingRunWarmup) {
				fn.ensureTailWarmupActivity?.();
			}
			fn.syncWorkSummaryStats?.(D.state.runStripEl);
			return;
		}
		if (payload.phase === 'progress') {
			const existing = id ? D.state.toolBlocks.get(id) : undefined;
			if (!existing) {
				return;
			}
			if (fn.isShellCommandCard?.(existing)) {
				fn.appendShellProgress(existing, payload);
				return;
			}
			const summary = existing.querySelector('summary');
			if (summary) {
				const name = String(payload.name ?? D.state.pendingToolName ?? 'tool');
				const elapsed = Number(payload.elapsedMs ?? 0);
				const sec = elapsed > 0 ? ` · ${(elapsed / 1000).toFixed(1)}s` : '';
				const tail = String(payload.outputPreview ?? '').trim();
				const preview = tail ? ` — ${tail.split('\n').pop()}` : '';
				const label =
					summary.querySelector('.msg-tool-summary-label') ||
					summary.querySelector('.drox-shell-card-header');
				const text = `▶ ${name}${sec}${preview}`;
				if (label) {
					label.textContent = text;
				} else {
					summary.textContent = text;
				}
			}
			return;
		}
	}
})(globalThis.DroxChat);
