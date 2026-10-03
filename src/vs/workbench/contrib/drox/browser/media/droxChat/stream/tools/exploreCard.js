/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	const EXPLORE_COLLAPSED_MAX_CHARS = 1800;
	const EXPLORE_EXPANDED_MAX_CHARS = 14000;

	function truncateExploreText(text, expanded) {
		const raw = String(text ?? '');
		if (!raw.trim()) {
			return { text: '', truncated: false };
		}
		const maxChars = expanded ? EXPLORE_EXPANDED_MAX_CHARS : EXPLORE_COLLAPSED_MAX_CHARS;
		if (raw.length <= maxChars) {
			return { text: raw, truncated: false };
		}
		return {
			text: raw.slice(0, maxChars) + (expanded ? '\n… (report truncated)' : '\n… (expand for more)'),
			truncated: true,
		};
	}

	function formatExploreStatus(exploreOutput, isError) {
		if (isError || exploreOutput?.exploreError) {
			return 'error';
		}
		return 'done';
	}

	function mountExploreCard(card) {
		const parent = fn.getLogMountParent() || D.dom.logEl;
		if (parent === D.dom.logEl) {
			fn.mountLinearLogNode?.(card);
		} else {
			parent.appendChild(card);
		}
		fn.syncPhaseBlockSummary?.(D.state.streamPhaseBlockEl);
		fn.scrollLog();
	}

	function copyText(text) {
		const value = String(text ?? '');
		if (!value) {
			return;
		}
		if (navigator.clipboard?.writeText) {
			void navigator.clipboard.writeText(value);
		}
	}

	function closeExploreMenus(except) {
		document.querySelectorAll('.drox-explore-card-menu.is-open').forEach((menu) => {
			if (menu !== except) {
				menu.classList.remove('is-open');
			}
		});
	}

	fn.createExploreCard = function (payload) {
		const card = document.createElement('details');
		card.className = 'msg-tool drox-explore-card msg-ai-frame running drox-log-indent';
		card.open = true;
		card.dataset.toolName = 'task';

		const summary = document.createElement('summary');
		const header = document.createElement('div');
		header.className = 'drox-explore-card-header';

		const chevron = document.createElement('span');
		chevron.className = 'drox-explore-card-chevron';
		chevron.setAttribute('aria-hidden', 'true');

		const icon = document.createElement('span');
		icon.className = 'drox-explore-card-icon';
		icon.setAttribute('aria-hidden', 'true');
		icon.title = 'Explore';

		const titleWrap = document.createElement('span');
		titleWrap.className = 'drox-explore-card-title-wrap';

		const title = document.createElement('span');
		title.className = 'drox-explore-card-title';
		title.textContent = 'Explore';

		const description = String(payload.exploreDescription || payload.target || '').trim();
		const descEl = document.createElement('span');
		descEl.className = 'drox-explore-card-desc';
		descEl.textContent = description || 'Read-only exploration';
		descEl.title = description;

		titleWrap.appendChild(title);
		titleWrap.appendChild(descEl);

		const thoroughness = String(payload.exploreThoroughness || '').trim();
		if (thoroughness) {
			card.dataset.thoroughness = thoroughness;
			const badge = document.createElement('span');
			badge.className = 'drox-explore-card-thoroughness';
			badge.textContent = thoroughness;
			titleWrap.appendChild(badge);
		}

		const status = document.createElement('span');
		status.className = 'drox-explore-card-status running';
		status.textContent = 'running';

		const actions = document.createElement('span');
		actions.className = 'drox-explore-card-actions';

		const menu = document.createElement('div');
		menu.className = 'drox-explore-card-menu';

		const menuBtn = document.createElement('button');
		menuBtn.type = 'button';
		menuBtn.className = 'drox-explore-card-menu-btn';
		menuBtn.title = 'More actions';
		menuBtn.setAttribute('aria-label', 'More actions');
		menuBtn.textContent = '⋯';
		menuBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const willOpen = !menu.classList.contains('is-open');
			closeExploreMenus(menu);
			menu.classList.toggle('is-open', willOpen);
		});

		const menuPanel = document.createElement('div');
		menuPanel.className = 'drox-explore-card-menu-panel';
		menuPanel.setAttribute('role', 'menu');

		const copyItem = document.createElement('button');
		copyItem.type = 'button';
		copyItem.className = 'drox-explore-card-menu-item';
		copyItem.textContent = 'Copy report';
		copyItem.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			menu.classList.remove('is-open');
			const report = card.querySelector('[data-role="explore-report"]')?.textContent
				|| description;
			copyText(report);
		});

		menuPanel.appendChild(copyItem);
		menu.appendChild(menuBtn);
		menu.appendChild(menuPanel);
		actions.appendChild(menu);

		header.appendChild(chevron);
		header.appendChild(icon);
		header.appendChild(titleWrap);
		header.appendChild(status);
		header.appendChild(actions);
		summary.appendChild(header);

		const body = document.createElement('div');
		body.className = 'drox-explore-card-body';

		const reportHost = document.createElement('div');
		reportHost.className = 'drox-explore-report';
		reportHost.dataset.role = 'explore-report-host';

		const placeholder = document.createElement('div');
		placeholder.className = 'drox-explore-report-placeholder';
		placeholder.textContent = 'Exploring…';
		reportHost.appendChild(placeholder);

		body.appendChild(reportHost);
		card.appendChild(summary);
		card.appendChild(body);
		mountExploreCard(card);
		return card;
	};

	fn.renderExploreReport = function (host, exploreOutput, isError, expanded) {
		if (!host) {
			return;
		}
		host.replaceChildren();
		const error = exploreOutput?.exploreError;
		const report = exploreOutput?.exploreReport;
		if (error) {
			const pre = document.createElement('pre');
			pre.className = 'drox-explore-report-block drox-explore-report-error';
			pre.dataset.role = 'explore-report';
			pre.textContent = error;
			host.appendChild(pre);
		}
		if (report) {
			const slice = truncateExploreText(report, expanded);
			const pre = document.createElement('pre');
			pre.className = 'drox-explore-report-block drox-explore-report-body';
			pre.dataset.role = 'explore-report';
			pre.textContent = slice.text;
			host.appendChild(pre);
		}
		if (isError && !host.childElementCount) {
			const pre = document.createElement('pre');
			pre.className = 'drox-explore-report-block drox-explore-report-error';
			pre.dataset.role = 'explore-report';
			pre.textContent = 'Explore failed.';
			host.appendChild(pre);
		}
	};

	fn.finishExploreCard = function (card, payload) {
		card.classList.remove('running');
		const isError = Boolean(payload.isError) || Boolean(payload.exploreOutput?.exploreError);
		if (isError) {
			card.classList.add('error');
			fn.markChatIssueElement?.(card);
			card.open = true;
		} else {
			card.open = false;
		}
		const status = card.querySelector('.drox-explore-card-status');
		if (status) {
			status.classList.remove('running');
			status.textContent = formatExploreStatus(payload.exploreOutput, isError);
			if (isError) {
				status.classList.add('is-error');
			}
		}
		const thoroughness = String(
			payload.exploreOutput?.exploreThoroughness || card.dataset.thoroughness || '',
		).trim();
		if (thoroughness) {
			let badge = card.querySelector('.drox-explore-card-thoroughness');
			if (!badge) {
				const wrap = card.querySelector('.drox-explore-card-title-wrap');
				badge = document.createElement('span');
				badge.className = 'drox-explore-card-thoroughness';
				wrap?.appendChild(badge);
			}
			if (badge) {
				badge.textContent = thoroughness;
			}
		}
		const reportHost = card.querySelector('[data-role="explore-report-host"]');
		fn.renderExploreReport(reportHost, payload.exploreOutput, isError, card.open);
		card.addEventListener('toggle', () => {
			fn.renderExploreReport(reportHost, payload.exploreOutput, isError, card.open);
		});
		fn.syncPhaseBlockSummary?.(D.state.streamPhaseBlockEl);
		fn.scrollLog();
	};

	fn.appendExploreProgress = function (card, payload) {
		const status = card.querySelector('.drox-explore-card-status');
		if (status) {
			const elapsed = Number(payload.elapsedMs ?? 0);
			const sec = elapsed > 0 ? ` · ${(elapsed / 1000).toFixed(1)}s` : '';
			status.textContent = `running${sec}`;
		}
		const reportHost = card.querySelector('[data-role="explore-report-host"]');
		const chunk = String(payload.outputPreview ?? '').trim();
		if (reportHost && chunk) {
			let pre = reportHost.querySelector('.drox-explore-report-progress');
			if (!pre) {
				reportHost.replaceChildren();
				pre = document.createElement('pre');
				pre.className = 'drox-explore-report-block drox-explore-report-body drox-explore-report-progress';
				reportHost.appendChild(pre);
			}
			const tail = chunk.split('\n').slice(-10).join('\n');
			pre.textContent = tail;
		}
		fn.scrollLog();
	};

	fn.isExploreCard = function (el) {
		return Boolean(el?.classList?.contains('drox-explore-card'));
	};

	document.addEventListener('click', (e) => {
		if (!(e.target instanceof Element) || !e.target.closest('.drox-explore-card-menu')) {
			closeExploreMenus();
		}
	});

	const _createToolBlock = fn.createToolBlock;
	fn.createToolBlock = function (payload) {
		if (payload.name === 'task' && payload.exploreDescription) {
			return fn.createExploreCard(payload);
		}
		return _createToolBlock.call(this, payload);
	};

	const _finishToolBlock = fn.finishToolBlock;
	fn.finishToolBlock = function (block, payload) {
		if (fn.isExploreCard(block)) {
			return fn.finishExploreCard(block, payload);
		}
		return _finishToolBlock.call(this, block, payload);
	};
})(globalThis.DroxChat);
