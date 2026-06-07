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
			fn.scrollLog();
			return;
		}
		if (payload.phase === 'finish') {
			D.state.pendingToolName = '';
			fn.finalizeAssistant();
			const existing = id ? D.state.toolBlocks.get(id) : undefined;
			if (existing) {
				fn.finishToolBlock(existing, payload);
				D.state.toolBlocks.delete(id);
			}
			if (D.state.busy) {
				fn.showActivityOnCurrentPhaseSummary();
			}
		}
	}
})(globalThis.DroxChat);
