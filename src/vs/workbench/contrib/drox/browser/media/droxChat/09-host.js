/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;
	fn.handleToolEvent = function(payload) {
		const id = String(payload.id ?? '');
		if (payload.phase === 'start') {
			fn.finalizeAssistantUnlessInExplore();
			const name = String(payload.name ?? '');
			D.state.pendingToolName = name;
			if (
				!fn.isExecutorUiContext?.() &&
				(name === 'file_edit' || name === 'file_write' || name === 'notebook_edit')
			) {
				fn.ensureExploreBundleActive('acting');
			}
			const verb = String(payload.verb ?? 'Ran');
			const target = String(payload.target ?? '');
			const label = target ? `${verb} ${target}` : verb;
			const details = fn.createToolBlock({
				...payload,
				name: String(payload.name ?? ''),
			});
			const toolSummary = details.querySelector('summary');
			if (D.state.busy && toolSummary) {
				fn.showActivityOnSummary(toolSummary);
			}
			if (id) {
				D.state.toolBlocks.set(id, details);
			}
			fn.scrollLog();
			return;
		}
		if (payload.phase === 'finish') {
			D.state.pendingToolName = '';
			fn.finalizeAssistantUnlessInExplore();
			const existing = id ? D.state.toolBlocks.get(id) : undefined;
			if (existing) {
				fn.finishToolBlock(existing, payload);
				D.state.toolBlocks.delete(id);
			}
			if (D.state.busy) {
				fn.showActivityOnCurrentPhaseSummary();
			}
		}
	}

	fn.abortRunLocally = function() {
		D.state.activeSubagentCount = 0;
		D.state.subagentJobCards.clear();
		D.state.executorCaptures?.clear();
		D.state.executorActiveJobId = null;
		D.state.executorCaptureJobId = null;
		D.state.activeExecutorJobIds.clear();
		D.state.executorCaptureToolsEl = null;
		D.state.executorCaptureThinkingEl = null;
		D.state.executorCaptureReportEl = null;
		D.state.pendingExecutorThinking = null;
		D.state.pendingExecutorThinkingByJob?.clear();
		D.state.executorActionRailEl = null;
		D.state.executorActionRailSummaryEl = null;
		D.state.executorActionRailListEl = null;
		D.state.executorActionLineCount = 0;
		D.state.pendingTodoUpdates = null;
		D.state.orchestrationRole = null;
		D.state.pendingToolName = '';
		fn.setBusy(false);
		D.state.answerStreamOnLog = false;
		fn.finalizeAssistant();
		fn.closeExploreBundle();
		fn.closeCurrentPhase();
		D.state.toolBlocks.clear();
		fn.flushPendingPromptQueue();
		D.dom.statusEl.textContent = 'Stopping…';
	}

	fn.handleSendButtonClick = function() {
		if (D.state.busy) {
			fn.abortRunLocally();
			D.vscode.postMessage({ type: 'cancelRun' });
			return;
		}
		fn.doSend();
	}

	fn.handleHostMessage = function (m) {
	if (!m || typeof m.kind !== 'string') {
			return;
		}
		switch (m.kind) {
			case 'state':
				fn.setBusy(Boolean(m.busy));
				if (m.busy) {
					fn.hideRunObjectiveSticky();
					if (!D.state.currentPhaseEl) {
						fn.showWarmupActivity();
					}
				}
				if (!m.busy) {
					D.state.answerStreamOnLog = false;
					fn.finalizeAssistant();
					const linearStrips =
						typeof fn.hasLinearRunStripsOnLog === 'function' && fn.hasLinearRunStripsOnLog();
					if (!D.state.uiReplayActive) {
						if (!linearStrips) {
							fn.splitAndPromoteUserFacingFromExplore();
						}
						if (!linearStrips && !fn.hasFinalAnswerOnLog()) {
							fn.promoteLastExploreReflectionToAnswer();
							fn.promoteExploreAssistantsToAnswer();
						}
					}
					fn.finalizeRunPresentation();
					if (!D.state.uiReplayActive && !linearStrips) {
						fn.compactExploreBundleKeepDom();
						fn.closeExploreBundle();
					}
					fn.closeCurrentPhase();
					D.state.toolBlocks.clear();
					fn.flushPendingPromptQueue();
				}
				break;
			case 'todoUpdate':
				if (typeof fn.commitRunStripAnchor === 'function') {
					fn.commitRunStripAnchor();
				}
				if (fn.isExecutorCaptureActive()) {
					D.state.pendingTodoUpdates = Array.isArray(m.todos) ? m.todos : [];
					break;
				}
				fn.renderTodos(Array.isArray(m.todos) ? m.todos : []);
				break;
			case 'clearAssistant':
				fn.finalizeAssistant();
				fn.closeExploreBundle();
				fn.closeCurrentPhase();
				if (D.state.busy) {
					fn.showWarmupActivity();
				}
				break;
			case 'phase':
				if (m.close === true) {
					fn.closePhaseMarker();
				} else if (typeof m.phase === 'string') {
					fn.enterPhase(m.phase);
				}
				break;
			case 'userPromptSticky':
				fn.setUserPromptSticky(m);
				break;
			case 'permissionMode':
				if (typeof m.mode === 'string') {
					fn.setPermissionMode(m.mode, false);
				}
				break;
			case 'llmModels':
				fn.applyLlmModelsFromHost(m);
				break;
			case 'generalSettings':
				fn.applyGeneralSettingsFromHost(m);
				break;
			case 'runObjective':
				fn.setRunObjectiveSticky(m);
				break;
			case 'loopIntervention':
				fn.renderLoopIntervention(m);
				break;
			case 'orchestrationRole':
				if (typeof m.role === 'string') {
					const role = String(m.role).trim().toLowerCase();
					D.state.orchestrationRole = role;
					if (role === 'architect') {
						D.state.pendingExecutorThinking = null;
		D.state.pendingExecutorThinkingByJob?.clear();
					}
					fn.renderOrchestrationRole(m.role);
				}
				break;
			case 'subagentStart':
				fn.renderSubagentStart(m);
				break;
			case 'subagentDone':
				fn.renderSubagentDone(m);
				break;
			case 'tabs':
				D.state.openTabs = Array.isArray(m.tabs)
					? m.tabs.map((t) => ({
						id: String(t.id ?? ''),
						title: String(t.title ?? D.const.DEFAULT_SESSION_TAB_TITLE),
					}))
					: [];
				D.state.activeTabId = typeof m.activeId === 'string' ? m.activeId : null;
				fn.renderSessionTabs();
				break;
			case 'exploreNotice':
				fn.appendExploreNotice(m.text || '');
				break;
			case 'append':
				if (m.role === 'error' && D.state.exploreBodyEl) {
					fn.appendExploreNotice(m.text || '');
					break;
				}
				fn.finalizeAssistant();
				if (m.role === 'user') {
					const userText = m.text || '';
					const userEl = fn.renderUserMessage(
						userText,
						Array.isArray(m.references) ? m.references : [],
						Array.isArray(m.pastes) ? m.pastes : [],
						Array.isArray(m.images) ? m.images : [],
					);
					userEl.dataset.msgId = typeof m.messageId === 'string' ? m.messageId : fn.randomId();
					fn.attachMessageRevertAction?.(userEl);
					if (D.state.userPromptStickyPendingLink) {
						fn.linkUserPromptStickyToMessage(userEl.dataset.msgId);
					}
					D.dom.logEl.appendChild(userEl);
					fn.refreshLastUserStickyRow?.();
					if (D.state.linearRunUi && typeof fn.anchorRunStripAfterUser === 'function') {
						fn.anchorRunStripAfterUser(userEl);
					}
					if (D.state.busy && !D.state.currentPhaseEl) {
						fn.showWarmupActivity();
					}
					D.state.logStickToBottom = true;
					fn.scrollLog(true);
				} else if (m.role === 'assistant') {
					D.state.assistantEl = fn.appendMessage('assistant', m.text || '');
					if (D.state.assistantEl) {
						D.state.assistantEl.dataset.msgId =
							typeof m.messageId === 'string' ? m.messageId : fn.randomId();
						fn.attachMessageRevertAction?.(D.state.assistantEl);
					}
				} else {
					const el = fn.appendMessage(m.role || 'system', m.text || '');
					if (el) {
						el.dataset.msgId = typeof m.messageId === 'string' ? m.messageId : fn.randomId();
						fn.attachMessageRevertAction?.(el);
					}
				}
				break;
			case 'delta':
				fn.appendDelta(m.text || '', m.executorJobId);
				break;
			case 'tool':
				if (typeof fn.commitRunStripAnchor === 'function') {
					fn.commitRunStripAnchor();
				}
				fn.handleToolEvent(m);
				break;
			case 'fileChange':
				fn.finalizeAssistantUnlessInExplore();
				fn.compactExploreBundleKeepDom();
				fn.appendFileChange(m);
				break;
			case 'usage':
				if (typeof m.inputTokens === 'number') {
					D.state.totalIn += m.inputTokens;
				}
				if (typeof m.outputTokens === 'number') {
					D.state.totalOut += m.outputTokens;
				}
				fn.renderStatus();
				break;
			case 'context':
				if (typeof m.tokensUsed === 'number') {
					D.state.ctxTokens = m.tokensUsed;
					fn.renderStatus();
				}
				break;
			case 'session':
				if (m.id) {
					D.state.currentSessionId = m.id;
					D.state.activeTabId = m.id;
					D.dom.statusEl.textContent = `Session ${m.id}`;
				}
				if (m.uiStats && typeof m.uiStats === 'object') {
					const u = m.uiStats;
					if (typeof u.totalIn === 'number') {
						D.state.totalIn = u.totalIn;
					}
					if (typeof u.totalOut === 'number') {
						D.state.totalOut = u.totalOut;
					}
					if (typeof u.ctx === 'number') {
						D.state.ctxTokens = u.ctx;
					}
					fn.renderStatus();
				}
				break;
			case 'sessions':
				fn.renderHistory(m);
				break;
			case 'compact':
				fn.setCompactBusy(Boolean(m.active));
				break;
			case 'memory':
				fn.appendMemoryChip(m);
				break;
			case 'appendReferences':
				if (Array.isArray(m.uris)) {
					fn.addUriRefs(m.uris);
				}
				break;
			case 'appendAttachments':
				if (Array.isArray(m.attachments)) {
					fn.addHostAttachments(m.attachments);
				}
				break;
			case 'dropHighlight':
				fn.setDropHighlight(Boolean(m.active));
				break;
			case 'prefillPrompt':
				fn.prefillComposer(typeof m.text === 'string' ? m.text : '', {
					replace: m.replace === true,
				});
				break;
			case 'pathCompleteResult': {
				const reqId = typeof m.requestId === 'string' ? m.requestId : '';
				if (!reqId || reqId !== D.state.pathCompletePendingId || !D.state.pathSuggestions) {
					break;
				}
				D.state.pathCompletePendingId = null;
				const cursor = fn.getPromptCursor();
				const ctx = fn.findAtCompletionContext(fn.getPromptText(), cursor);
				if (!ctx) {
					fn.hidePathSuggestions();
					break;
				}
				const items = Array.isArray(m.items) ? m.items : [];
				if (items.length === 0) {
					fn.hidePathSuggestions();
					break;
				}
				D.state.pathSuggestions = {
					items: items.map((it) => ({
						label: String(it.label ?? ''),
						insertText: String(it.insertText ?? ''),
						kind: String(it.kind ?? 'file'),
						description:
							typeof it.description === 'string' ? it.description : undefined,
					})),
					selected: 0,
					replaceStart: ctx.replaceStart,
					replaceEnd: ctx.replaceEnd,
				};
				fn.renderPathSuggestions();
				break;
			}
			case 'pasteCandidate': {
				const c = m.candidate;
				if (!c || typeof c.token !== 'string') {
					break;
				}
				D.state.pasteCandidates.set(c.token, {
					token: c.token,
					kind: c.kind === 'terminal' ? 'terminal' : 'editor',
					absPath: c.absPath || '',
					relPath: c.relPath ?? null,
					languageId: c.languageId || 'plaintext',
					startLine: c.startLine || 1,
					endLine: c.endLine || 1,
					lineCount: c.lineCount || 1,
					text: c.text || '',
				});
				while (D.state.pasteCandidates.size > 10) {
					const oldest = D.state.pasteCandidates.keys().next().value;
					if (oldest === undefined) {
						break;
					}
					D.state.pasteCandidates.delete(oldest);
				}
				break;
			}
			case 'userAsk':
				fn.openUserAskCard(m);
				break;
			case 'userAskClose':
				fn.closeUserAskCard();
				break;
			case 'chatReset':
				fn.resetChatUi();
				fn.refreshLastUserStickyRow?.();
				break;
			case 'replayPrepare':
				D.state.uiReplayActive = true;
				if (typeof fn.beginLinearRunStrip === 'function') {
					fn.beginLinearRunStrip();
				}
				break;
			case 'sessionReplayDone':
				fn.finalizeSessionReplayUi();
				D.state.uiReplayActive = false;
				break;
			case 'runRevert':
				D.state.runRevertAvailable = Boolean(m.canRevert);
				D.state.runRevertFileCount = typeof m.fileCount === 'number' ? m.fileCount : 0;
				fn.updateRunRevertButton();
				break;
			default:
				break;
		}
	};
})(globalThis.DroxChat);
