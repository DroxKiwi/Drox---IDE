/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.isComposerEmpty = function() {
		return (
			fn.isPromptTextEmpty() &&
			D.state.attachments.length === 0 &&
			D.state.references.length === 0 &&
			D.state.pasteAttachments.length === 0
		);
	}

	fn.pasteLineRef = function(startLine, endLine) {
		const s = Math.max(1, Math.floor(startLine || 1));
		const e = Math.max(s, Math.floor(endLine || s));
		return s === e ? `L${s}` : `L${s}-${e}`;
	}

	fn.normalizeForHash = function(s) {
		return String(s).replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
	}

	fn.fnv1a32 = function(input) {
		let hash = 0x811c9dc5;
		for (let i = 0; i < input.length; i++) {
			hash ^= input.charCodeAt(i);
			hash =
				(hash +
					((hash << 1) +
						(hash << 4) +
						(hash << 7) +
						(hash << 8) +
						(hash << 24))) >>>
				0;
		}
		return hash.toString(16).padStart(8, '0');
	}

	fn.updatePromptPlaceholder = function() {
		let ph = D.const.DEFAULT_PROMPT_PLACEHOLDER;
		if (D.state.pendingPrompts.length > 0 && fn.isPromptTextEmpty()) {
			ph = '↑ edit queued messages · Enter = queue';
		} else if (D.state.pasteAttachments.length > 0 && fn.isPromptTextEmpty()) {
			ph = `${D.state.pasteAttachments.length} snippet(s) — @ path or send`;
		}
		D.dom.promptEl.placeholder = ph;
	}
})(globalThis.DroxChat);
