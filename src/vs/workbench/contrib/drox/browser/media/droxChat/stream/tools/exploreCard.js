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

	function shortExploreTitle(payload) {
		const title = String(payload.exploreTitle || '').trim();
		if (title) {
			return title;
		}
		const description = String(payload.exploreDescription || payload.target || '').trim();
		if (!description) {
			return 'Read-only exploration';
		}
		const first = description.split(/\r?\n/).map((l) => l.trim()).find((l) => l) || description;
		return first.length > 72 ? `${first.slice(0, 71).trimEnd()}…` : first;
	}

	/** Stable key to reuse the same card when the model retries after an error. */
	function exploreMissionKey(payload) {
		return shortExploreTitle(payload).toLowerCase().replace(/\s+/g, ' ').trim();
	}

	function findReusableExploreCard(missionKey) {
		if (!missionKey) {
			return undefined;
		}
		const cards = D.dom.logEl?.querySelectorAll?.('.drox-explore-card.error') || [];
		for (let i = cards.length - 1; i >= 0; i--) {
			const card = cards[i];
			if (card.dataset.exploreMission === missionKey && !card.classList.contains('running')) {
				return card;
			}
		}
		return undefined;
	}

	/** Reset a failed Explore card so a retry continues in the same frame. */
	fn.resetExploreCardForRetry = function (card, payload) {
		card.classList.remove('error', 'drox-chat-issue-hidden');
		card.classList.add('running');
		card.open = true;

		const mission = shortExploreTitle(payload);
		card.dataset.exploreMission = exploreMissionKey(payload);
		const descEl = card.querySelector('.drox-explore-card-desc');
		if (descEl) {
			descEl.textContent = mission;
			descEl.title = mission;
		}
		const thoroughness = String(payload.exploreThoroughness || '').trim();
		if (thoroughness) {
			card.dataset.thoroughness = thoroughness;
		}
		const wrap = card.querySelector('.drox-explore-card-title-wrap');
		if (wrap) {
			mountExploreTags(wrap, payload);
		}
		const status = card.querySelector('.drox-explore-card-status');
		if (status) {
			status.classList.remove('is-error');
			status.classList.add('running');
			status.textContent = 'running';
		}

		const brief = String(payload.exploreDescription || '').trim();
		const promptPre = card.querySelector('[data-role="explore-prompt"]');
		if (brief && promptPre) {
			promptPre.textContent = brief;
			card.dataset.explorePrompt = brief;
		}

		const activityHost = card.querySelector('[data-role="explore-activity-host"]');
		if (activityHost) {
			activityHost.hidden = false;
			const activityPre = activityHost.querySelector('[data-role="explore-activity"]');
			if (activityPre) {
				activityPre.textContent = 'Retrying…';
			}
		}
		const reportHost = card.querySelector('[data-role="explore-report-host"]');
		if (reportHost) {
			reportHost.replaceChildren();
			const placeholder = document.createElement('div');
			placeholder.className = 'drox-explore-report-placeholder';
			placeholder.textContent = 'Report will appear here…';
			reportHost.appendChild(placeholder);
		}
		fn.scrollLog();
		return card;
	};

	const RETURN_KIND_LABELS = {
		paths_read: 'paths',
		file_summaries: 'summaries',
		key_symbols: 'symbols',
		code_snippets: 'snippets',
		structure_map: 'structure',
		gaps: 'gaps',
	};

	function normalizeReturnKinds(raw) {
		if (!Array.isArray(raw)) {
			return [];
		}
		const out = [];
		for (const item of raw) {
			const key = String(item || '').trim().toLowerCase().replace(/-/g, '_');
			if (RETURN_KIND_LABELS[key] && !out.includes(key)) {
				out.push(key);
			}
		}
		return out;
	}

	function mountExploreTags(titleWrap, payload) {
		let row = titleWrap.querySelector('[data-role="explore-tags"]');
		if (!row) {
			row = document.createElement('div');
			row.className = 'drox-explore-card-tags';
			row.dataset.role = 'explore-tags';
			titleWrap.appendChild(row);
		}
		row.replaceChildren();

		const subType = String(payload.exploreSubagentType || 'explore').trim() || 'explore';
		const typeTag = document.createElement('span');
		typeTag.className = 'drox-explore-card-tag drox-explore-card-tag--type';
		typeTag.textContent = subType;
		typeTag.title = `Sub-agent type: ${subType}`;
		row.appendChild(typeTag);

		const thoroughness = String(payload.exploreThoroughness || '').trim();
		if (thoroughness) {
			const t = document.createElement('span');
			t.className = 'drox-explore-card-tag drox-explore-card-tag--depth';
			t.textContent = thoroughness;
			t.title = `Thoroughness: ${thoroughness}`;
			row.appendChild(t);
		}

		const kinds = normalizeReturnKinds(payload.exploreReturnKinds);
		const incomplete = new Set(normalizeReturnKinds(payload.exploreKindsIncomplete));
		for (const kind of kinds) {
			const tag = document.createElement('span');
			tag.className = 'drox-explore-card-tag drox-explore-card-tag--kind'
				+ (incomplete.has(kind) ? ' is-incomplete' : '');
			tag.textContent = RETURN_KIND_LABELS[kind] || kind;
			tag.title = incomplete.has(kind)
				? `Return kind incomplete: ${kind}`
				: `Return kind: ${kind}`;
			tag.dataset.kind = kind;
			row.appendChild(tag);
		}

		if (kinds.length) {
			titleWrap.closest('.drox-explore-card')?.setAttribute(
				'data-return-kinds',
				kinds.join(','),
			);
		}
	}

	/** Split live progress into activity lines vs report preview. */
	function splitExploreLive(chunk) {
		const raw = String(chunk ?? '');
		const marker = '\n--- report ---\n';
		const idx = raw.indexOf(marker);
		if (idx >= 0) {
			return {
				activity: raw.slice(0, idx).trimEnd(),
				report: raw.slice(idx + marker.length).trim(),
			};
		}
		if (raw.startsWith('--- report ---\n')) {
			return { activity: '', report: raw.slice('--- report ---\n'.length).trim() };
		}
		// Activity-only (tool lines) when no marker yet.
		return { activity: raw.trimEnd(), report: '' };
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

		const kind = document.createElement('span');
		kind.className = 'drox-explore-card-kind';
		kind.textContent = 'Explore';

		const mission = shortExploreTitle(payload);
		const descEl = document.createElement('span');
		descEl.className = 'drox-explore-card-desc';
		descEl.textContent = mission;
		descEl.title = mission;

		titleWrap.appendChild(kind);
		titleWrap.appendChild(descEl);

		card.dataset.exploreMission = exploreMissionKey(payload);
		const thoroughness = String(payload.exploreThoroughness || '').trim();
		if (thoroughness) {
			card.dataset.thoroughness = thoroughness;
		}
		mountExploreTags(titleWrap, payload);

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
				|| card.querySelector('[data-role="explore-prompt"]')?.textContent
				|| mission;
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

		const brief = String(payload.exploreDescription || '').trim();
		if (brief) {
			const promptDetails = document.createElement('details');
			promptDetails.className = 'drox-explore-prompt';
			// Open only when brief is short enough to skim.
			promptDetails.open = brief.length <= 280;
			const promptSummary = document.createElement('summary');
			promptSummary.className = 'drox-explore-prompt-summary';
			promptSummary.textContent = 'Prompt';
			const promptPre = document.createElement('pre');
			promptPre.className = 'drox-explore-prompt-body';
			promptPre.dataset.role = 'explore-prompt';
			promptPre.textContent = brief;
			promptDetails.appendChild(promptSummary);
			promptDetails.appendChild(promptPre);
			body.appendChild(promptDetails);
			card.dataset.explorePrompt = brief;
		}

		const activityHost = document.createElement('div');
		activityHost.className = 'drox-explore-activity';
		activityHost.dataset.role = 'explore-activity-host';
		const activityLabel = document.createElement('div');
		activityLabel.className = 'drox-explore-panel-label';
		activityLabel.textContent = 'Activity';
		const activityPre = document.createElement('pre');
		activityPre.className = 'drox-explore-activity-log';
		activityPre.dataset.role = 'explore-activity';
		activityPre.textContent = 'Waiting for tools…';
		activityHost.appendChild(activityLabel);
		activityHost.appendChild(activityPre);
		body.appendChild(activityHost);

		const reportHost = document.createElement('div');
		reportHost.className = 'drox-explore-report';
		reportHost.dataset.role = 'explore-report-host';

		const placeholder = document.createElement('div');
		placeholder.className = 'drox-explore-report-placeholder';
		placeholder.textContent = 'Report will appear here…';
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
		card.classList.remove('running', 'is-live');
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
		const wrap = card.querySelector('.drox-explore-card-title-wrap');
		if (wrap) {
			const existingKinds = (card.getAttribute('data-return-kinds') || '')
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			mountExploreTags(wrap, {
				exploreSubagentType: payload.exploreOutput?.exploreSubagentType || 'explore',
				exploreThoroughness:
					payload.exploreOutput?.exploreThoroughness || card.dataset.thoroughness || '',
				exploreReturnKinds: payload.exploreOutput?.exploreReturnKinds?.length
					? payload.exploreOutput.exploreReturnKinds
					: existingKinds,
				exploreKindsIncomplete: payload.exploreOutput?.exploreKindsIncomplete,
			});
		}
		const activityHost = card.querySelector('[data-role="explore-activity-host"]');
		if (activityHost && !card.querySelector('[data-role="explore-activity"]')?.textContent?.includes('→')) {
			activityHost.hidden = true;
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
			status.classList.add('running');
		}
		card.classList.add('running', 'is-live');
		card.open = true;
		const chunk = String(payload.outputPreview ?? '').trimEnd();
		const { activity, report } = splitExploreLive(chunk);

		const activityPre = card.querySelector('[data-role="explore-activity"]');
		if (activityPre && activity) {
			activityPre.textContent = activity;
			const nearBottom = (activityPre.scrollHeight - activityPre.scrollTop - activityPre.clientHeight) < 48;
			if (nearBottom) {
				activityPre.scrollTop = activityPre.scrollHeight;
			}
		}

		const reportHost = card.querySelector('[data-role="explore-report-host"]');
		if (reportHost && report) {
			let pre = reportHost.querySelector('.drox-explore-report-progress');
			if (!pre) {
				reportHost.replaceChildren();
				const label = document.createElement('div');
				label.className = 'drox-explore-panel-label';
				label.textContent = 'Report (live)';
				pre = document.createElement('pre');
				pre.className = 'drox-explore-report-block drox-explore-report-body drox-explore-report-progress';
				pre.dataset.role = 'explore-live';
				reportHost.appendChild(label);
				reportHost.appendChild(pre);
			}
			pre.textContent = report;
			const nearBottom = (pre.scrollHeight - pre.scrollTop - pre.clientHeight) < 48;
			if (nearBottom) {
				pre.scrollTop = pre.scrollHeight;
			}
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
		if (payload.name === 'task' && (payload.exploreDescription || payload.exploreTitle)) {
			const missionKey = exploreMissionKey(payload);
			const reusable = findReusableExploreCard(missionKey);
			if (reusable) {
				return fn.resetExploreCardForRetry(reusable, payload);
			}
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
