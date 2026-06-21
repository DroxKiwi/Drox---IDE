/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;
	fn.coerceUserAskQuestions = function(questions) {
		const tryParse = (s) => {
			const t = String(s ?? '').trim();
			if (!t.startsWith('[') && !t.startsWith('{')) {
				return undefined;
			}
			try {
				return JSON.parse(t);
			} catch {
				return undefined;
			}
		};
		const coerceItem = (raw, index) => {
			const prompt = String(raw?.prompt ?? '');
			const parsed = tryParse(prompt);
			if (parsed !== undefined) {
				if (Array.isArray(parsed)) {
					const out = [];
					for (let i = 0; i < parsed.length; i++) {
						const item = parsed[i];
						if (item && typeof item === 'object') {
							out.push(...coerceItem(item, index + i));
						} else if (typeof item === 'string' && item.trim()) {
							out.push({
								id: `q${index + i + 1}`,
								prompt: item.trim(),
								options: [],
								allowMultiple: false,
								allowFreeText: true,
							});
						}
					}
					if (out.length > 0) {
						return out;
					}
				} else if (parsed && typeof parsed === 'object') {
					return coerceItem(parsed, index);
				}
			}
			const options = Array.isArray(raw?.options)
				? raw.options.map((o, j) => ({
					id: typeof o.id === 'string' && o.id ? o.id : `opt${j + 1}`,
					label: typeof o.label === 'string' ? o.label : '',
				}))
				: [];
			return [{
				id: typeof raw?.id === 'string' && raw.id ? raw.id : `q${index + 1}`,
				prompt,
				options,
				allowMultiple: Boolean(raw?.allowMultiple),
				allowFreeText: Boolean(raw?.allowFreeText) || options.length === 0,
			}];
		};
		const src = Array.isArray(questions) ? questions : [];
		const out = [];
		for (let i = 0; i < src.length; i++) {
			out.push(...coerceItem(src[i], i));
		}
		return out.length > 0 ? out : src;
	};

	fn.openUserAskCard = function(payload) {
		const questions = fn.coerceUserAskQuestions(payload.questions || []);
		D.state.userAskPending = true;
		D.state.pendingUserAsk = {
			askId: payload.askId,
			title: payload.title,
			questions,
			currentIndex: 0,
			answers: new Map(),
		};
		for (const q of D.state.pendingUserAsk.questions) {
			D.state.pendingUserAsk.answers.set(q.id, { optionIds: new Set(), freeText: '', skipped: false });
		}
		D.dom.userAskEl.hidden = false;
		if (D.dom.composerEl) {
			D.dom.composerEl.hidden = true;
		}
		fn.renderUserAskCard();
		fn.updateComposerChrome();
		D.dom.statusEl.textContent = 'Questions pending…';
	}

	fn.closeUserAskCard = function() {
		D.state.userAskPending = false;
		D.state.pendingUserAsk = null;
		D.dom.userAskEl.hidden = true;
		D.dom.userAskEl.innerHTML = '';
		if (D.dom.composerEl) {
			D.dom.composerEl.hidden = false;
		}
		fn.updateComposerChrome();
	}

	fn.renderUserAskCard = function() {
		if (!D.state.pendingUserAsk) {
			return;
		}
		const total = D.state.pendingUserAsk.questions.length;
		const idx = D.state.pendingUserAsk.currentIndex;
		const q = D.state.pendingUserAsk.questions[idx];
		const state = D.state.pendingUserAsk.answers.get(q.id);
		D.dom.userAskEl.innerHTML = '';

		const header = document.createElement('div');
		header.className = 'user-ask-header';
		const headerLeft = document.createElement('div');
		headerLeft.className = 'user-ask-title';
		headerLeft.textContent = D.state.pendingUserAsk.title || 'Questions';
		const headerRight = document.createElement('div');
		headerRight.className = 'user-ask-counter';
		headerRight.textContent = `${idx + 1} / ${total}`;
		header.appendChild(headerLeft);
		header.appendChild(headerRight);
		D.dom.userAskEl.appendChild(header);

		const promptLine = document.createElement('div');
		promptLine.className = 'user-ask-prompt markdown';
		const promptMd = `${idx + 1}. ${q.prompt}`;
		if (typeof fn.setAssistantMarkdown === 'function') {
			fn.setAssistantMarkdown(promptLine, promptMd);
		} else {
			promptLine.textContent = promptMd;
		}
		D.dom.userAskEl.appendChild(promptLine);

		if (q.options.length > 0) {
			const opts = document.createElement('div');
			opts.className = 'user-ask-options';
			q.options.forEach((opt, j) => {
				const selected = state.optionIds.has(opt.id);
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'user-ask-option' + (selected ? ' selected' : '');
				const letter = document.createElement('span');
				letter.className = 'user-ask-option-letter';
				letter.textContent = String.fromCharCode(65 + (j % 26));
				const lab = document.createElement('span');
				lab.className = 'user-ask-option-label';
				lab.textContent = opt.label;
				btn.appendChild(letter);
				btn.appendChild(lab);
				btn.addEventListener('click', () => {
					if (!q.allowMultiple) {
						state.optionIds.clear();
					}
					if (state.optionIds.has(opt.id)) {
						state.optionIds.delete(opt.id);
					} else {
						state.optionIds.add(opt.id);
					}
					state.skipped = false;
					fn.renderUserAskCard();
				});
				opts.appendChild(btn);
			});
			D.dom.userAskEl.appendChild(opts);
		}

		if (q.allowFreeText || q.options.length === 0) {
			const wrap = document.createElement('div');
			wrap.className = 'user-ask-free';
			const ta = document.createElement('textarea');
			ta.className = 'user-ask-free-input';
			ta.rows = 2;
			ta.placeholder = q.options.length === 0 ? 'Your answer…' : 'Optional details';
			ta.value = state.freeText || '';
			ta.addEventListener('input', () => {
				state.freeText = ta.value;
				if (state.freeText) {
					state.skipped = false;
				}
			});
			ta.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					state.freeText = ta.value;
					fn.advanceOrSubmitUserAsk();
				} else if (e.key === 'Escape') {
					e.preventDefault();
					fn.skipUserAsk();
				}
			});
			wrap.appendChild(ta);
			D.dom.userAskEl.appendChild(wrap);
		}

		const actions = document.createElement('div');
		actions.className = 'user-ask-actions';
		const skip = document.createElement('button');
		skip.type = 'button';
		skip.className = 'user-ask-action skip';
		skip.textContent = 'Skip';
		skip.addEventListener('click', () => fn.skipUserAsk());
		const prev = document.createElement('button');
		prev.type = 'button';
		prev.className = 'user-ask-action prev';
		prev.textContent = '◀';
		prev.disabled = idx === 0;
		prev.addEventListener('click', () => {
			D.state.pendingUserAsk.currentIndex = Math.max(0, idx - 1);
			fn.renderUserAskCard();
		});
		const next = document.createElement('button');
		next.type = 'button';
		next.className = 'user-ask-action next';
		next.textContent = idx === total - 1 ? 'Continue' : 'Next';
		next.addEventListener('click', () => fn.advanceOrSubmitUserAsk());
		actions.appendChild(skip);
		actions.appendChild(prev);
		actions.appendChild(next);
		D.dom.userAskEl.appendChild(actions);
	}

	fn.advanceOrSubmitUserAsk = function() {
		if (!D.state.pendingUserAsk) {
			return;
		}
		if (D.state.pendingUserAsk.currentIndex < D.state.pendingUserAsk.questions.length - 1) {
			D.state.pendingUserAsk.currentIndex += 1;
			fn.renderUserAskCard();
			return;
		}
		fn.submitUserAsk(false);
	}

	fn.skipUserAsk = function() {
		fn.submitUserAsk(true);
	}

	fn.submitUserAsk = function(skipped) {
		if (!D.state.pendingUserAsk) {
			return;
		}
		const answers = D.state.pendingUserAsk.questions.map((q) => {
			const s = D.state.pendingUserAsk.answers.get(q.id);
			return {
				id: q.id,
				optionIds: Array.from(s.optionIds),
				freeText: s.freeText,
				skipped,
			};
		});
		D.vscode.postMessage({
			type: 'userAskAnswer',
			askId: D.state.pendingUserAsk.askId,
			answers,
		});
		fn.closeUserAskCard();
	}
})(globalThis.DroxChat);
