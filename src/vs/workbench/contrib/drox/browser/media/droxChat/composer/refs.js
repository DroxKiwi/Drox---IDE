/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.renderRefs = function() {
		if (!D.dom.refsEl) {
			return;
		}
		D.dom.refsEl.replaceChildren();
		for (const ref of D.state.references) {
			const chip = document.createElement('span');
			chip.className = 'ref-chip';
			chip.title = ref.uri;
			const label = document.createElement('span');
			label.className = 'ref-label';
			label.textContent = ref.label;
			const remove = document.createElement('button');
			remove.type = 'button';
			remove.className = 'ref-remove';
			remove.textContent = '×';
			remove.title = 'Remove';
			remove.addEventListener('click', () => {
				D.state.references = D.state.references.filter((r) => r.id !== ref.id);
				fn.renderRefs();
			});
			chip.appendChild(label);
			chip.appendChild(remove);
			D.dom.refsEl.appendChild(chip);
		}
		for (const p of D.state.pasteAttachments) {
			const chip = document.createElement('span');
			const isTerminal = p.kind === 'terminal';
			chip.className = isTerminal
				? 'ref-chip paste-chip paste-chip-terminal'
				: 'ref-chip paste-chip';
			const lineRef = fn.pasteLineRef(p.startLine, p.endLine);
			const refPath = p.relPath ?? p.absPath ?? '';
			const chipLabel = isTerminal
				? `${refPath || 'Terminal'} · ${lineRef}`
				: `${fn.labelFor(refPath)} · ${lineRef}`;
			chip.title = chipLabel;
			const label = document.createElement('button');
			label.type = 'button';
			label.className = 'ref-label paste-label';
			label.textContent = chipLabel;
			label.addEventListener('click', () => {
				D.vscode.postMessage({
					type: 'openPasteSource',
					kind: p.kind,
					absPath: p.absPath,
					relPath: p.relPath,
					startLine: p.startLine,
					endLine: p.endLine,
				});
			});
			const remove = document.createElement('button');
			remove.type = 'button';
			remove.className = 'ref-remove';
			remove.textContent = '×';
			remove.title = 'Remove';
			remove.addEventListener('click', () => {
				D.state.pasteAttachments = D.state.pasteAttachments.filter((x) => x.id !== p.id);
				fn.renderRefs();
			});
			chip.appendChild(label);
			chip.appendChild(remove);
			D.dom.refsEl.appendChild(chip);
		}
		fn.updatePromptPlaceholder();
	}
})(globalThis.DroxChat);
