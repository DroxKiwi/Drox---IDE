/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;

	const SHELL_COLLAPSED_MAX_LINES = 24;
	const SHELL_COLLAPSED_MAX_CHARS = 2000;

	function shellKindLabel(kind) {
		return kind === 'powershell' ? 'PowerShell' : 'bash';
	}

	function truncateShellText(text, expanded) {
		const raw = String(text ?? '');
		if (!raw.trim()) {
			return { text: '', truncated: false };
		}
		const maxLines = expanded ? 120 : SHELL_COLLAPSED_MAX_LINES;
		const maxChars = expanded ? 12000 : SHELL_COLLAPSED_MAX_CHARS;
		const lines = raw.replace(/\r\n/g, '\n').split('\n');
		let total = 0;
		const kept = [];
		let truncated = false;
		for (const line of lines) {
			if (kept.length >= maxLines || total >= maxChars) {
				truncated = true;
				break;
			}
			total += line.length;
			kept.push(line);
		}
		if (!truncated && lines.length > kept.length) {
			truncated = true;
		}
		let out = kept.join('\n');
		if (truncated) {
			out += expanded ? '\n… (output truncated)' : '\n… (expand for more)';
		}
		return { text: out, truncated };
	}

	function formatShellStatusBadge(shellOutput, isError) {
		if (!shellOutput) {
			return isError ? 'error' : 'done';
		}
		if (shellOutput.error) {
			return 'error';
		}
		if (shellOutput.timed_out) {
			return 'timeout';
		}
		if (typeof shellOutput.exit_code === 'number') {
			return shellOutput.exit_code === 0 ? 'exit 0' : `exit ${shellOutput.exit_code}`;
		}
		return isError ? 'error' : 'done';
	}

	function mountShellCard(card, summaryHtml) {
		const parent = fn.getLogMountParent();
		if (fn.shouldUseCollapsibleToolTray?.(parent)) {
			fn.mountToolBlockInTray?.(parent, card, summaryHtml);
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

	fn.createShellCommandCard = function (payload) {
		const card = document.createElement('details');
		card.className = 'msg-tool drox-shell-card msg-ai-frame running drox-log-indent';
		card.open = true;
		card.dataset.toolName = 'bash';

		const summary = document.createElement('summary');
		const header = document.createElement('div');
		header.className = 'drox-shell-card-header';

		const icon = document.createElement('span');
		icon.className = 'drox-shell-card-icon';
		icon.setAttribute('aria-hidden', 'true');

		const title = document.createElement('span');
		title.className = 'drox-shell-card-title';
		title.textContent = String(payload.shellDescription || 'Shell command').trim() || 'Shell command';

		const kind = document.createElement('span');
		kind.className = 'drox-shell-card-kind';
		kind.textContent = shellKindLabel(payload.shellKind);

		const status = document.createElement('span');
		status.className = 'drox-shell-card-status running';
		status.textContent = 'running';

		const actions = document.createElement('span');
		actions.className = 'drox-shell-card-actions';

		const copyBtn = document.createElement('button');
		copyBtn.type = 'button';
		copyBtn.className = 'drox-shell-card-copy';
		copyBtn.title = 'Copy command';
		copyBtn.textContent = 'Copy';
		const commandText = String(payload.shellCommand || payload.target || '').trim();
		copyBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			copyText(commandText);
		});

		header.appendChild(icon);
		header.appendChild(title);
		header.appendChild(kind);
		header.appendChild(status);
		actions.appendChild(copyBtn);
		header.appendChild(actions);
		summary.appendChild(header);

		const body = document.createElement('div');
		body.className = 'drox-shell-card-body';

		const cmd = document.createElement('div');
		cmd.className = 'drox-shell-cmd';
		const prompt = document.createElement('span');
		prompt.className = 'drox-shell-prompt';
		prompt.textContent = '$ ';
		const cmdText = document.createElement('code');
		cmdText.className = 'drox-shell-cmd-text';
		cmdText.textContent = commandText;
		cmd.appendChild(prompt);
		cmd.appendChild(cmdText);

		const outputHost = document.createElement('div');
		outputHost.className = 'drox-shell-output';
		outputHost.dataset.role = 'shell-output';

		body.appendChild(cmd);
		body.appendChild(outputHost);
		card.appendChild(summary);
		card.appendChild(body);

		const summaryHtml = `<strong>${title.textContent}</strong> <span class="tool-target">${shellKindLabel(payload.shellKind)}</span>`;
		mountShellCard(card, summaryHtml);
		return card;
	};

	fn.renderShellOutput = function (outputHost, shellOutput, isError, expanded) {
		if (!outputHost) {
			return;
		}
		outputHost.replaceChildren();
		if (!shellOutput) {
			return;
		}
		const blocks = [];
		if (shellOutput.error) {
			blocks.push({ kind: 'stderr', text: shellOutput.error });
		}
		if (shellOutput.stdout) {
			blocks.push({ kind: 'stdout', text: shellOutput.stdout });
		}
		if (shellOutput.stderr) {
			blocks.push({ kind: 'stderr', text: shellOutput.stderr });
		}
		for (const block of blocks) {
			const slice = truncateShellText(block.text, expanded);
			if (!slice.text.trim()) {
				continue;
			}
			const pre = document.createElement('pre');
			pre.className = `drox-shell-output-block drox-shell-output-${block.kind}`;
			pre.textContent = slice.text;
			outputHost.appendChild(pre);
		}
		if (typeof shellOutput.duration_ms === 'number' && shellOutput.duration_ms > 0) {
			const meta = document.createElement('div');
			meta.className = 'drox-shell-meta';
			meta.textContent = `${shellOutput.duration_ms} ms`;
			outputHost.appendChild(meta);
		}
		if (isError && !outputHost.childElementCount) {
			const pre = document.createElement('pre');
			pre.className = 'drox-shell-output-block drox-shell-output-stderr';
			pre.textContent = 'Command failed.';
			outputHost.appendChild(pre);
		}
	};

	fn.finishShellCommandCard = function (card, payload) {
		card.classList.remove('running');
		card.open = true;
		const isError = Boolean(payload.isError);
		if (isError) {
			card.classList.add('error');
			fn.markChatIssueElement?.(card);
		}
		const status = card.querySelector('.drox-shell-card-status');
		if (status) {
			status.classList.remove('running');
			status.textContent = formatShellStatusBadge(payload.shellOutput, isError);
			if (isError || (payload.shellOutput && payload.shellOutput.exit_code !== 0)) {
				status.classList.add('is-error');
			}
		}
		const outputHost = card.querySelector('[data-role="shell-output"]');
		fn.renderShellOutput(outputHost, payload.shellOutput, isError, card.open);
		card.addEventListener('toggle', () => {
			fn.renderShellOutput(outputHost, payload.shellOutput, isError, card.open);
		});

		const toolSummary = card.querySelector('summary');
		if (toolSummary && card.parentElement?.classList?.contains('drox-collapsible-tray-inner')) {
			const trayInner = card.parentElement;
			const trayDetails = trayInner.closest('details');
			if (trayDetails) {
				const traySummary = trayDetails.querySelector(':scope > summary');
				if (traySummary) {
					fn.stripActivityGridsFromElement?.(toolSummary);
					traySummary.innerHTML = toolSummary.innerHTML;
					const n = trayInner.childElementCount;
					traySummary.title =
						n <= 1 ? '1 tool — click for history' : `${n} tools — click for full history`;
				}
			}
		}
		fn.syncPhaseBlockSummary?.(D.state.streamPhaseBlockEl);
		fn.scrollLog();
	};

	fn.appendShellProgress = function (card, payload) {
		const outputHost = card.querySelector('[data-role="shell-output"]');
		const chunk = String(payload.outputPreview ?? '').trim();
		if (outputHost && chunk) {
			let pre = outputHost.querySelector('.drox-shell-output-progress');
			if (!pre) {
				pre = document.createElement('pre');
				pre.className = 'drox-shell-output-block drox-shell-output-stdout drox-shell-output-progress';
				outputHost.appendChild(pre);
			}
			const tail = chunk.split('\n').slice(-8).join('\n');
			pre.textContent = tail;
		}
		const status = card.querySelector('.drox-shell-card-status');
		if (status) {
			const elapsed = Number(payload.elapsedMs ?? 0);
			const sec = elapsed > 0 ? ` · ${(elapsed / 1000).toFixed(1)}s` : '';
			status.textContent = `running${sec}`;
		}
		fn.scrollLog();
	};

	fn.isShellCommandCard = function (el) {
		return Boolean(el?.classList?.contains('drox-shell-card'));
	};

	const _createToolBlock = fn.createToolBlock;
	fn.createToolBlock = function (payload) {
		if (payload.name === 'bash' && payload.shellCommand) {
			return fn.createShellCommandCard(payload);
		}
		return _createToolBlock.call(this, payload);
	};

	const _finishToolBlock = fn.finishToolBlock;
	fn.finishToolBlock = function (block, payload) {
		if (fn.isShellCommandCard(block)) {
			return fn.finishShellCommandCard(block, payload);
		}
		return _finishToolBlock.call(this, block, payload);
	};
})(globalThis.DroxChat);
