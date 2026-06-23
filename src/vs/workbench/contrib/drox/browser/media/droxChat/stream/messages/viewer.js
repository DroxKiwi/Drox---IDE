/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	function isUserMessageExpandBlocked(target) {
		return Boolean(
			target?.closest?.(
				'.msg-ref-link, .msg-paste-link, .msg-paste-terminal, .msg-user-copy, .msg-user-toolbar',
			),
		);
	}

	fn.setUserMessageExpanded = function (row, textSpan, expanded) {
		if (!row || !textSpan) {
			return;
		}
		if (expanded) {
			textSpan.classList.remove('is-clamped');
			textSpan.classList.add('is-expanded');
			row.classList.add('msg-user-expanded');
			textSpan.setAttribute('aria-expanded', 'true');
			textSpan.setAttribute('title', 'Cliquer pour réduire');
			textSpan.setAttribute('aria-label', 'Réduire le message');
		} else {
			textSpan.classList.add('is-clamped');
			textSpan.classList.remove('is-expanded');
			row.classList.remove('msg-user-expanded');
			textSpan.setAttribute('aria-expanded', 'false');
			textSpan.setAttribute('title', 'Cliquer pour voir le message complet');
			textSpan.setAttribute('aria-label', 'Voir le message complet');
		}
	};

	fn.toggleUserMessageExpand = function (row, textSpan) {
		if (!row?.classList?.contains('msg-user-expandable') || !textSpan) {
			return;
		}
		const next = !textSpan.classList.contains('is-expanded');
		fn.setUserMessageExpanded(row, textSpan, next);
		if (next) {
			requestAnimationFrame(() => {
				row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			});
		}
	};

	fn.bindUserMessageExpand = function (row, textSpan, _fullText) {
		const markExpandable = () => {
			if (!textSpan.classList.contains('is-clamped')) {
				return;
			}
			const overflows = textSpan.scrollHeight > textSpan.clientHeight + 2;
			if (overflows) {
				row.classList.add('msg-user-expandable');
				textSpan.classList.add('msg-user-text-expandable');
				textSpan.setAttribute('aria-expanded', 'false');
				textSpan.setAttribute('title', 'Cliquer pour voir le message complet');
				textSpan.setAttribute('tabindex', '0');
				textSpan.setAttribute('role', 'button');
				textSpan.setAttribute('aria-label', 'Voir le message complet');
			}
		};
		requestAnimationFrame(() => requestAnimationFrame(markExpandable));

		const onToggle = (e) => {
			if (!row.classList.contains('msg-user-expandable')) {
				return;
			}
			if (isUserMessageExpandBlocked(e.target)) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			fn.toggleUserMessageExpand(row, textSpan);
		};

		textSpan.addEventListener('click', onToggle);
		textSpan.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && textSpan.classList.contains('is-expanded')) {
				e.preventDefault();
				e.stopPropagation();
				fn.setUserMessageExpanded(row, textSpan, false);
				return;
			}
			if (
				(e.key === 'Enter' || e.key === ' ') &&
				row.classList.contains('msg-user-expandable')
			) {
				e.preventDefault();
				e.stopPropagation();
				fn.toggleUserMessageExpand(row, textSpan);
			}
		});
	};
})(globalThis.DroxChat);
