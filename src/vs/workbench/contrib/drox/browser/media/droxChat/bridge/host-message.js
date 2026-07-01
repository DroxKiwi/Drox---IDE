/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function (D) {
	const fn = D.fn;

	fn.handleHostMessage = function (m) {
	if (!m || typeof m.kind !== 'string') {
			return;
		}
		try {
		switch (m.kind) {
			case 'productVersion': {
				const label = String(m.label ?? '').trim();
				const title = String(m.title ?? '').trim();
				if (D.dom.chatVersionEl) {
					D.dom.chatVersionEl.textContent = label || '?';
				}
				if (D.dom.chatBrandEl) {
					D.dom.chatBrandEl.title = title || label || 'Drox';
				}
				if (typeof fn.bindChatVersionReleaseNotes === 'function') {
					fn.bindChatVersionReleaseNotes();
				}
				break;
			}
			case 'state':
				if (D.state.uiReplayActive) {
					break;
				}
				fn.setBusy(Boolean(m.busy));
				if (m.busy) {
					fn.hideRunObjectiveSticky();
					if (!D.state.currentPhaseEl) {
						fn.showWarmupActivity();
					}
				}
				if (!m.busy) {
					fn.finalizeAssistant();
					fn.promoteChatStreamToFinalAnswer?.();
					const preserveDiscussion =
						typeof fn.shouldPreserveDiscussionStripOnBusyEnd === 'function' &&
						fn.shouldPreserveDiscussionStripOnBusyEnd();
					if (preserveDiscussion) {
						fn.parkAllLinearFinalAnswers?.();
					} else {
						fn.finalizeRunPresentation();
					}
					fn.closeCurrentPhase();
					fn.closeActivePhaseBlock?.();
					fn.collapseRunWorkSection?.();
					fn.syncWorkSummaryStats?.(D.state.runStripEl);
					fn.hideAgentActivitySticky?.();
					D.state.toolBlocks.clear();
					fn.flushPendingPromptQueue();
				}
				break;
			case 'todoUpdate':
				if (D.state.uiReplayActive) {
					break;
				}
				if (typeof fn.commitRunStripAnchor === 'function') {
					fn.commitRunStripAnchor();
				}
				fn.renderTodos(Array.isArray(m.todos) ? m.todos : []);
				break;
			case 'railStationEnter':
				if (m.taskId && typeof fn.highlightTodoTask === 'function') {
					fn.highlightTodoTask(m.taskId, 'running');
				}
				break;
			case 'clearAssistant':
				if (D.state.uiReplayActive) {
					break;
				}
				fn.resetChatStreamForTurn?.();
				fn.finalizeAssistant();
				fn.closeCurrentPhase();
				if (D.state.busy) {
					fn.showWarmupActivity();
				}
				break;
			case 'phase':
				if (D.state.uiReplayActive) {
					break;
				}
				if (m.close === true) {
					fn.closePhaseMarker();
				} else if (typeof m.phase === 'string') {
					fn.enterPhase(m.phase);
					fn.syncWorkSummaryStats?.(D.state.runStripEl);
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
			case 'connectionTestResult':
				if (typeof fn.handleConnectionTestResult === 'function') {
					fn.handleConnectionTestResult(m);
				}
				break;
			case 'runObjective':
				fn.setRunObjectiveSticky(m);
				break;
			case 'loopIntervention':
				fn.renderLoopIntervention(m);
				break;
			case 'orchestrationRole':
				if (D.state.uiReplayActive) {
					break;
				}
				if (typeof m.role === 'string') {
					const role = String(m.role).trim().toLowerCase();
					D.state.orchestrationRole = role;
					if (role === 'architect_discussion') {
						fn.beginDiscussionRunPresentation?.();
					}
					if (role === 'architect') {
						D.state.discussionRunActive = false;
						fn.unlockArchitectEditRunPresentation?.();
					}
					fn.renderOrchestrationRole(m.role);
				}
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
				if (m.role === 'error') {
					if (typeof fn.appendExploreNotice === 'function') {
						fn.appendExploreNotice(m.text || '');
					} else {
						fn.appendMessage('error', m.text || '');
					}
					break;
				}
				const skipFinalizeForReplayAssistant =
					D.state.uiReplayActive && m.role === 'assistant';
				if (!skipFinalizeForReplayAssistant) {
					fn.finalizeAssistant();
				}
				if (m.role === 'user') {
					const userText = m.text || '';
					const userBlock = fn.renderUserMessage(
						userText,
						Array.isArray(m.references) ? m.references : [],
						Array.isArray(m.pastes) ? m.pastes : [],
						Array.isArray(m.images) ? m.images : [],
					);
					const userRow = fn.resolveUserMessageRow(userBlock);
					const messageId = typeof m.messageId === 'string' ? m.messageId : fn.randomId();
					if (userRow) {
						userRow.dataset.msgId = messageId;
					}
					if (D.state.userPromptStickyPendingLink) {
						fn.linkUserPromptStickyToMessage(messageId);
					}
					fn.reconcileOptimisticUserMessage?.();
					fn.appendToLog?.(userBlock);
					const liveUserRow = fn.resolveUserMessageRow(userBlock);
					fn.resetLinearTurnAnchors?.();
					fn.resetHistoryReplayStream?.();
					fn.refreshLastUserStickyRow?.();
					fn.repositionWarmupAfterUser?.();
					if ((D.state.busy || D.state.pendingRunWarmup) && !D.state.currentPhaseEl) {
						fn.showWarmupActivity();
					}
					fn.ensureTailWarmupActivity?.();
					if (D.state.linearRunUi && typeof fn.anchorRunStripAfterUser === 'function' && liveUserRow) {
						fn.anchorRunStripAfterUser(liveUserRow);
					}
					if (!D.state.uiReplayActive) {
						fn.pinLogToBottom?.();
					}
					if (typeof fn.reapplyRunRecoveryActionsIfNeeded === 'function') {
						fn.reapplyRunRecoveryActionsIfNeeded();
					}
				} else if (m.role === 'assistant') {
					const text = String(m.text || '').trim();
					let createdEl = null;
					if (D.state.uiReplayActive) {
						if (text) {
							fn.resetHistoryReplayStream?.();
							createdEl = fn.appendMessage('assistant', m.text || '');
							fn.markTurnFinalAssistant?.(createdEl);
						}
					} else if (D.state.linearRunUi && text) {
						if (D.state.currentPhase === 'answering') {
							fn.appendDelta(text);
						} else if (typeof fn.mountStreamPhaseLine === 'function') {
							fn.mountStreamPhaseLine(text, { variant: 'phase' });
						} else {
							createdEl = fn.appendMessage('assistant', text);
						}
					} else {
						createdEl = fn.appendMessage('assistant', m.text || '');
					}
					if (createdEl) {
						D.state.assistantEl = createdEl;
						createdEl.dataset.msgId =
							typeof m.messageId === 'string' ? m.messageId : fn.randomId();
					}
				} else {
					const el = fn.appendMessage(m.role || 'system', m.text || '');
					if (el) {
						el.dataset.msgId = typeof m.messageId === 'string' ? m.messageId : fn.randomId();
					}
				}
				break;
			case 'userFacingReply':
				if (D.state.uiReplayActive) {
					fn.historyReplayUserFacingReply?.(m.text || '');
					break;
				}
				fn.applyUserFacingReply?.(m.text || '');
				break;
			case 'delta':
				if (D.state.uiReplayActive) {
					fn.historyReplayDelta?.(m.text || '');
					break;
				}
				fn.appendDelta(m.text || '');
				break;
			case 'tool':
				if (!D.state.uiReplayActive && typeof fn.commitRunStripAnchor === 'function') {
					fn.commitRunStripAnchor();
				}
				fn.handleToolEvent(m);
				break;
			case 'fileChange':
				if (!D.state.uiReplayActive) {
					if (typeof fn.commitRunStripAnchor === 'function') {
						fn.commitRunStripAnchor();
					}
					fn.finalizeAssistant();
				}
				fn.appendFileChange(m);
				break;
			case 'fileChangeState':
				fn.updateFileChangeUndoState?.(m.toolId, m.undoState);
				break;
			case 'fileChangeUndoReady':
				fn.enableFileChangeUndo?.(m.toolId);
				break;
			case 'usage':
				if (typeof m.inputTokens === 'number') {
					D.state.totalIn += m.inputTokens;
					if (m.inputTokens > 0) {
						D.state.ctxTokens = m.inputTokens;
					}
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
				if (typeof fn.appendMemoryChip === 'function') {
					fn.appendMemoryChip(m);
				}
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
				fn.dismissRunRecoveryActions?.();
				fn.resetChatUi();
				fn.refreshLastUserStickyRow?.();
				break;
			case 'replayPrepare':
				fn.beginHistoryReplay?.();
				break;
			case 'sessionHistory':
				fn.applySessionHistoryMeta?.(m);
				D.state.sessionHistoryLoading = false;
				break;
			case 'sessionReplayDone':
				fn.finalizeSessionReplayUi?.(m);
				break;
			case 'runRecoveryOffer':
				if (typeof m.messageId === 'string') {
					fn.offerRunRecoveryOnUserMessage?.(m.messageId);
				}
				break;
			case 'runRecoveryDismiss':
				fn.dismissRunRecoveryActions?.();
				break;
			case 'runRecoveryClearAfter':
				if (typeof m.messageId === 'string') {
					fn.clearLogAfterUserMessage?.(m.messageId);
				}
				break;
			case 'runRevert':
				D.state.runRevertAvailable = Boolean(m.canRevert);
				D.state.runRevertFileCount = typeof m.fileCount === 'number' ? m.fileCount : 0;
				fn.updateRunRevertButton();
				break;
			default:
				break;
		}
		} catch (err) {
			console.error('[DroxChat] host message failed', m?.kind, err);
		}
	};
})(globalThis.DroxChat);
