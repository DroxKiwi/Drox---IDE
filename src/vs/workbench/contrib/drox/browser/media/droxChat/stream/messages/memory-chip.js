/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	fn.appendMemoryChip = function (payload) {
		const log = D.dom.logEl;
		if (!log) {
			return null;
		}
		const stick =
			typeof fn.isLogNearBottom === 'function'
				? fn.isLogNearBottom(log)
				: true;

		const div = document.createElement('div');
		div.className = 'msg-memory-chip';

		const icon = document.createElement('span');
		icon.className = 'memory-chip-icon';
		icon.textContent = '◌';
		div.appendChild(icon);

		const label = document.createElement('span');
		label.className = 'memory-chip-label';
		label.textContent = 'Session archivée';
		div.appendChild(label);

		const slug = String(payload?.slug ?? '');
		const objective = String(payload?.objective ?? '').trim();
		const path = String(payload?.path ?? '');
		const summary = objective ? `${slug} — ${objective}` : slug;

		const text = document.createElement('span');
		text.className = 'memory-chip-text';
		text.textContent = summary;
		div.appendChild(text);

		if (path) {
			const link = document.createElement('a');
			link.className = 'memory-chip-link';
			link.textContent = 'ouvrir';
			link.href = '#';
			link.title = path;
			link.addEventListener('click', (e) => {
				e.preventDefault();
				D.vscode.postMessage({ type: 'openFile', filePath: path });
			});
			div.appendChild(link);
		}

		fn.appendToLog?.(div);
		if (stick) {
			fn.scrollLog?.();
		}
		return div;
	};
})(globalThis.DroxChat);
