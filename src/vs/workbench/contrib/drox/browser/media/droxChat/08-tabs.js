/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;
	fn.tabDisplayTitle = function(tab) {
		const t = typeof tab?.title === 'string' ? tab.title.trim() : '';
		return t || D.const.DEFAULT_SESSION_TAB_TITLE;
	}

	fn.findSessionTabElement = function(sessionId) {
		if (!D.dom.sessionTabsListEl || !sessionId) {
			return null;
		}
		for (const el of D.dom.sessionTabsListEl.querySelectorAll('.session-tab')) {
			if (el.dataset.sessionId === sessionId) {
				return el;
			}
		}
		return null;
	}

	fn.updateSessionTabElement = function(el, tab) {
		const isActive = tab.id === D.state.activeTabId;
		el.classList.toggle('active', isActive);
		el.setAttribute('aria-selected', isActive ? 'true' : 'false');
		const title = el.querySelector('.session-tab-title');
		if (title) {
			const label = fn.tabDisplayTitle(tab);
			title.textContent = label;
			title.title = label;
		}
	}

	fn.animateSessionTabClose = function(el, sessionId) {
		if (el.classList.contains('session-tab-closing')) {
			return;
		}
		el.classList.add('session-tab-closing');
		el.setAttribute('aria-hidden', 'true');
		let finished = false;
		const finish = () => {
			if (finished) {
				return;
			}
			finished = true;
			el.remove();
			D.vscode.postMessage({ type: 'closeTab', sessionId });
		};
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reducedMotion) {
			finish();
			return;
		}
		el.addEventListener(
			'animationend',
			(ev) => {
				if (ev.target === el) {
					finish();
				}
			},
			{ once: true },
		);
		window.setTimeout(() => {
			if (el.isConnected) {
				finish();
			}
		}, D.const.SESSION_TAB_ANIM_MS + 40);
	}

	fn.createSessionTabElement = function(tab) {
		const isActive = tab.id === D.state.activeTabId;
		const el = document.createElement('div');
		el.className = 'session-tab' + (isActive ? ' active' : '');
		el.setAttribute('role', 'tab');
		el.setAttribute('aria-selected', isActive ? 'true' : 'false');
		el.dataset.sessionId = tab.id;

		const peek = document.createElement('div');
		peek.className = 'session-tab-peek';

		const icon = document.createElement('span');
		icon.className = 'session-tab-icon';
		icon.setAttribute('aria-hidden', 'true');
		icon.innerHTML =
			'<svg class="drox-icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round" d="M3 3.5h10v7H6.2L3 13.5V3.5z"/></svg>';

		const title = document.createElement('span');
		title.className = 'session-tab-title';
		const label = fn.tabDisplayTitle(tab);
		title.textContent = label;
		title.title = label;

		const closeBtn = document.createElement('button');
		closeBtn.type = 'button';
		closeBtn.className = 'session-tab-close';
		closeBtn.setAttribute('aria-label', 'Close chat');
		closeBtn.title = 'Close';
		closeBtn.innerHTML =
			'<svg class="drox-icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" d="M4.2 4.2l7.6 7.6M11.8 4.2 4.2 11.8"/></svg>';

		peek.appendChild(icon);
		peek.appendChild(title);
		peek.appendChild(closeBtn);
		el.appendChild(peek);

		el.addEventListener('click', (e) => {
			if (e.target === closeBtn || closeBtn.contains(/** @type {Node} */ (e.target))) {
				return;
			}
			if (tab.id !== D.state.activeTabId) {
				D.vscode.postMessage({ type: 'switchTab', sessionId: tab.id });
			}
		});
		closeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			fn.animateSessionTabClose(el, tab.id);
		});

		return el;
	}

	fn.reorderSessionTabs = function(orderedIds) {
		if (!D.dom.sessionTabsListEl) {
			return;
		}
		for (const id of orderedIds) {
			const el = fn.findSessionTabElement(id);
			if (el && !el.classList.contains('session-tab-closing')) {
				D.dom.sessionTabsListEl.appendChild(el);
			}
		}
	}

	fn.renderSessionTabs = function() {
		if (!D.dom.sessionTabsListEl) {
			return;
		}

		const nextIdSet = new Set(D.state.openTabs.map((t) => t.id));

		for (const el of [...D.dom.sessionTabsListEl.querySelectorAll('.session-tab')]) {
			const id = el.dataset.sessionId;
			if (!id || nextIdSet.has(id) || el.classList.contains('session-tab-closing')) {
				continue;
			}
			el.classList.add('session-tab-closing');
			el.setAttribute('aria-hidden', 'true');
			const remove = () => el.remove();
			el.addEventListener('animationend', (ev) => {
				if (ev.target === el) {
					remove();
				}
			}, { once: true });
			window.setTimeout(() => {
				if (el.isConnected) {
					remove();
				}
			}, D.const.SESSION_TAB_ANIM_MS + 40);
		}

		for (const tab of D.state.openTabs) {
			let el = fn.findSessionTabElement(tab.id);
			if (!el) {
				el = fn.createSessionTabElement(tab);
				el.classList.add('session-tab-enter');
				D.dom.sessionTabsListEl.appendChild(el);
				el.addEventListener(
					'animationend',
					(ev) => {
						if (ev.target === el) {
							el.classList.remove('session-tab-enter');
						}
					},
					{ once: true },
				);
			} else {
				fn.updateSessionTabElement(el, tab);
			}
		}

		fn.reorderSessionTabs(D.state.openTabs.map((t) => t.id));
	}

	fn.setRunObjectiveSticky = function(payload) {
		const text = typeof payload.text === 'string' ? payload.text.trim() : '';
		if (!text || !D.dom.stickyRunObjectiveEl) {
			fn.hideRunObjectiveSticky();
			return;
		}
		D.dom.stickyRunObjectiveEl.innerHTML = '';
		D.dom.stickyRunObjectiveEl.title = text;

		const ic = document.createElement('span');
		ic.className = 'sticky-ic sticky-ic-objective';
		ic.setAttribute('aria-hidden', 'true');

		const body = document.createElement('div');
		body.className = 'sticky-body';

		const label = document.createElement('span');
		label.className = 'sticky-meta';
		label.textContent = 'Run objective';

		const txt = document.createElement('span');
		txt.className = 'sticky-text';
		txt.textContent = text.length > 220 ? `${text.slice(0, 219)}…` : text;

		body.appendChild(label);
		body.appendChild(txt);
		D.dom.stickyRunObjectiveEl.appendChild(ic);
		D.dom.stickyRunObjectiveEl.appendChild(body);
		D.dom.stickyRunObjectiveEl.hidden = false;
	}

	fn.hideRunObjectiveSticky = function() {
		if (!D.dom.stickyRunObjectiveEl) {
			return;
		}
		D.dom.stickyRunObjectiveEl.hidden = true;
		D.dom.stickyRunObjectiveEl.innerHTML = '';
		D.dom.stickyRunObjectiveEl.removeAttribute('title');
	}

	/** Compteur discret : agent principal (run) + sous-agents `task` actifs. */
	fn.updateAgentActivitySticky = function() {
		const el = D.dom.agentActivityStickyEl;
		if (!el) {
			return;
		}
		const parent = D.state.busy ? 1 : 0;
		const sub = D.state.activeSubagentCount || 0;
		const total = parent + sub;
		if (total <= 0) {
			el.hidden = true;
			el.textContent = '';
			return;
		}
		el.hidden = false;
		el.textContent =
			total === 1 ? '1 agent actif' : `${total} agents actifs`;
		if (sub > 0) {
			el.title =
				`Agents logiques Drox : principal ${parent ? 'oui' : 'non'} + ${sub} sous-agent(s).\n` +
				`Ollama n’affiche qu’une ligne par tag modèle (ex. 9b + 2b = 2 lignes si les deux sous-agents partagent le même modèle).\n` +
				`Parallèle GPU sur le même tag : OLLAMA_NUM_PARALLEL côté serveur, pas MAX_LOADED_MODELS.`;
		} else {
			el.title = 'Agent principal en cours';
		}
	}

	fn.hideAgentActivitySticky = function() {
		if (!D.dom.agentActivityStickyEl) {
			return;
		}
		D.dom.agentActivityStickyEl.hidden = true;
		D.dom.agentActivityStickyEl.textContent = '';
	}
})(globalThis.DroxChat);
