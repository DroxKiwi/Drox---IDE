/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (global) {
	'use strict';

	const PROMPT_ZWSP = '\u200B';

	/**
	 * @param {HTMLElement} root
	 */
	function create(root) {
		function walkText(node, visitor) {
			if (node.nodeType === Node.TEXT_NODE) {
				visitor.onText((node.nodeValue || '').replaceAll(PROMPT_ZWSP, ''));
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el = /** @type {HTMLElement} */ (node);
				if (el.classList.contains('prompt-ref-chip')) {
					visitor.onRef({
						uri: el.dataset.uri || '',
						label: el.dataset.label || '',
						refId: el.dataset.refId || '',
					});
				} else if (el.tagName === 'BR') {
					visitor.onText('\n');
				} else {
					for (const child of el.childNodes) {
						walkText(child, visitor);
					}
				}
			}
		}

		function getPlainText() {
			let text = '';
			walkText(root, {
				onText: (t) => {
					text += t;
				},
				onRef: (ref) => {
					text += `@${ref.label}`;
				},
			});
			return text;
		}

		function collectReferences() {
			/** @type {Array<{ uri: string; label: string; refId: string }>} */
			const out = [];
			const seen = new Set();
			root.querySelectorAll('.prompt-ref-chip').forEach((el) => {
				const uri = el.dataset.uri || '';
				if (!uri || seen.has(uri)) {
					return;
				}
				seen.add(uri);
				out.push({
					uri,
					label: el.dataset.label || '',
					refId: el.dataset.refId || '',
				});
			});
			return out;
		}

		function isEmpty() {
			return getPlainText().trim().length === 0 && collectReferences().length === 0;
		}

		function clear() {
			root.innerHTML = '';
		}

		function focus() {
			root.focus();
		}

		function getCursorOffset() {
			const sel = global.getSelection();
			if (!sel?.rangeCount || !root.contains(sel.anchorNode)) {
				return getPlainText().length;
			}
			const anchorNode = sel.anchorNode;
			const anchorOffset = sel.anchorOffset;
			let offset = 0;
			let found = false;

			const visit = (node) => {
				if (found) {
					return;
				}
				if (node.nodeType === Node.TEXT_NODE) {
					const value = (node.nodeValue || '').replaceAll(PROMPT_ZWSP, '');
					if (node === anchorNode) {
						offset += anchorOffset;
						found = true;
						return;
					}
					offset += value.length;
					return;
				}
				if (node.nodeType === Node.ELEMENT_NODE) {
					const el = /** @type {HTMLElement} */ (node);
					if (el.classList.contains('prompt-ref-chip')) {
						const token = `@${el.dataset.label || ''}`;
						if (node === anchorNode || node.contains(anchorNode)) {
							offset += token.length;
							found = true;
							return;
						}
						offset += token.length;
						return;
					}
					for (const child of el.childNodes) {
						visit(child);
					}
				}
			};

			for (const child of root.childNodes) {
				visit(child);
			}
			return offset;
		}

		function placeCaretAtEnd() {
			focus();
			const range = document.createRange();
			range.selectNodeContents(root);
			range.collapse(false);
			const sel = global.getSelection();
			if (sel) {
				sel.removeAllRanges();
				sel.addRange(range);
			}
		}

		/** Prépare un contenteditable vide (souvent un seul <br>) pour une insertion visible. */
		function normalizeEmptyRoot() {
			const chips = root.querySelectorAll('.prompt-ref-chip');
			if (chips.length > 0) {
				return;
			}
			let hasText = false;
			for (const child of root.childNodes) {
				if (child.nodeType === Node.TEXT_NODE && (child.nodeValue || '').replaceAll(PROMPT_ZWSP, '').length > 0) {
					hasText = true;
					break;
				}
				if (child.nodeType === Node.ELEMENT_NODE && child.nodeName !== 'BR') {
					hasText = true;
					break;
				}
			}
			if (!hasText) {
				root.innerHTML = '';
			}
		}

		/**
		 * @param {HTMLElement} node
		 * @param {{ atEnd?: boolean }} [options]
		 */
		function insertNodeAtCursor(node, options) {
			if (options?.atEnd) {
				normalizeEmptyRoot();
				placeCaretAtEnd();
			} else {
				focus();
			}
			const sel = global.getSelection();
			let range;
			if (sel?.rangeCount) {
				range = sel.getRangeAt(0);
				if (!root.contains(range.commonAncestorContainer)) {
					range = document.createRange();
					range.selectNodeContents(root);
					range.collapse(false);
				}
			} else {
				range = document.createRange();
				range.selectNodeContents(root);
				range.collapse(false);
			}
			range.deleteContents();
			range.insertNode(node);
			const spacer = document.createTextNode(PROMPT_ZWSP);
			range.setStartAfter(node);
			range.collapse(true);
			range.insertNode(spacer);
			range.setStartAfter(spacer);
			range.collapse(true);
			if (sel) {
				sel.removeAllRanges();
				sel.addRange(range);
			}
		}

		/**
		 * @param {{ id: string; uri: string; label: string; onRemove?: () => void }} ref
		 */
		function createRefChip(ref) {
			const chip = document.createElement('span');
			chip.className = 'prompt-ref-chip msg-ref-link composer-ref-link';
			chip.contentEditable = 'false';
			chip.dataset.uri = ref.uri;
			chip.dataset.label = ref.label;
			chip.dataset.refId = ref.id;
			chip.title = ref.uri;

			const label = document.createElement('span');
			label.className = 'msg-ref-link-label';
			label.textContent = ref.label;
			chip.appendChild(label);

			const remove = document.createElement('button');
			remove.type = 'button';
			remove.className = 'msg-ref-remove';
			remove.textContent = '×';
			remove.title = 'Remove';
			remove.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				chip.remove();
				if (typeof ref.onRemove === 'function') {
					ref.onRemove();
				}
			});
			chip.appendChild(remove);
			return chip;
		}

		/**
		 * @param {{ id: string; uri: string; label: string; onRemove?: () => void }} ref
		 */
		function insertRef(ref) {
			insertNodeAtCursor(createRefChip(ref));
		}

		/**
		 * @param {{ id: string; uri: string; label: string; onRemove?: () => void }} ref
		 */
		function insertRefAtEnd(ref) {
			const chip = createRefChip(ref);
			insertNodeAtCursor(chip, { atEnd: true });
			chip.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		}

		function insertText(text) {
			insertNodeAtCursor(document.createTextNode(text));
		}

		/**
		 * @param {string} text
		 * @param {Array<{ id: string; uri: string; label: string }>} [knownRefs]
		 */
		function setPlainText(text, knownRefs = []) {
			clear();
			if (!text) {
				return;
			}
			const labelToRef = new Map();
			for (const r of knownRefs) {
				labelToRef.set(r.label, r);
			}
			const re = /@([^\s@]+)/g;
			let last = 0;
			let m;
			while ((m = re.exec(text)) !== null) {
				if (m.index > last) {
					root.appendChild(document.createTextNode(text.slice(last, m.index)));
				}
				const token = m[1];
				const known = labelToRef.get(token);
				if (known) {
					root.appendChild(
						createRefChip({
							...known,
							onRemove: known.onRemove,
						}),
					);
					root.appendChild(document.createTextNode(PROMPT_ZWSP));
				} else {
					root.appendChild(document.createTextNode(m[0]));
				}
				last = m.index + m[0].length;
			}
			if (last < text.length) {
				root.appendChild(document.createTextNode(text.slice(last)));
			}
		}

		/**
		 * @param {string} text
		 * @param {Array<{ uri: string; label: string; abs?: string; kind?: string }>} refs
		 * @param {(ref: { uri: string; label: string }) => HTMLElement} createChip
		 */
		function renderInlineParts(text, refs, createChip) {
			const body = document.createElement('div');
			body.className = 'msg-user-body';
			const labels = refs
				.map((r) => ({
					ref: r,
					label: r.label || r.rel || '',
				}))
				.filter((x) => x.label)
				.sort((a, b) => b.label.length - a.label.length);

			let remaining = text;
			while (remaining.length > 0) {
				let earliest = null;
				let matchLabel = '';
				for (const { ref, label } of labels) {
					const token = `@${label}`;
					const idx = remaining.indexOf(token);
					if (idx !== -1 && (earliest === null || idx < earliest)) {
						earliest = idx;
						matchLabel = label;
					}
				}
				if (earliest === null) {
					const span = document.createElement('span');
					span.className = 'msg-user-text';
					span.textContent = remaining;
					body.appendChild(span);
					break;
				}
				if (earliest > 0) {
					const span = document.createElement('span');
					span.className = 'msg-user-text';
					span.textContent = remaining.slice(0, earliest);
					body.appendChild(span);
				}
				const hit = labels.find((x) => x.label === matchLabel);
				if (hit) {
					body.appendChild(createChip(hit.ref));
				} else {
					const span = document.createElement('span');
					span.className = 'msg-user-text';
					span.textContent = `@${matchLabel}`;
					body.appendChild(span);
				}
				remaining = remaining.slice(earliest + `@${matchLabel}`.length);
			}
			return body;
		}

		return {
			getPlainText,
			collectReferences,
			isEmpty,
			clear,
			focus,
			getCursorOffset,
			placeCaretAtEnd,
			insertRef,
			insertRefAtEnd,
			insertText,
			setPlainText,
			createRefChip,
			renderInlineParts,
		};
	}

	global.DroxPromptEditor = { create };
})();
