/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	D.state.selectedPermissionMode = D.const.DEFAULT_PERMISSION_MODE;
	D.const.PENDING_SNIPPET_MAX = 120;
	D.const.DEFAULT_PROMPT_PLACEHOLDER =
		'Ask Drox… (drop files here · @ path · /help · Enter to send)';
	D.state.pathCompleteSeq = 0;
	D.state.pathCompletePendingId = null;
	D.state.pathCompleteTimer = null;
	D.state.pathSuggestions = null;
	D.state.busy = false;
	D.state.compactBusy = false;
	D.state.runRevertAvailable = false;
	D.state.runRevertFileCount = 0;
	D.state.pendingPrompts = [];
	D.state.attachments = [];
	D.state.references = [];
	D.state.pasteAttachments = [];
	D.state.pasteCandidates = new Map();
	D.state.userAskPending = false;
	D.state.pendingUserAsk = null;
	D.state.assistantEl = null;
	D.state.currentPhase = null;
	D.state.currentPhaseEl = null;
	D.state.currentPhaseBodyEl = null;
	D.state.logIssuesTray = null;
	D.state.toolTraysByParent = null;
	/** Fil linéaire — strip agent du tour en cours. */
	D.state.runStripEl = null;
	/** Fil linéaire — ancrage après le message user du tour. */
	D.state.runStripAnchorEl = null;
	/** Vrai dès le premier événement live (delta/tool/todo) — verrouille le strip en place. */
	D.state.runStripCommitted = false;
	/** Mode fil linéaire actif (run ou replay). */
	D.state.linearRunUi = false;
	D.state.pendingTodoUpdates = null;
	/** `architect` | `architect_discussion` | null — run rail solo. */
	D.state.orchestrationRole = null;
	/** Rejeu journal UI — pas de post-traitement legacy. */
	D.state.uiReplayActive = false;
	/** L2 — pagination scroll-back historique session. */
	D.state.sessionHistoryHasOlder = false;
	D.state.sessionHistoryOldestIndex = 0;
	D.state.sessionHistoryLoading = false;
	D.state._historyStreamEl = null;
	D.state._turnFinalAssistantEl = null;
	/** Nom outil en cours (mount section plan vs work). */
	D.state.pendingToolName = '';
	/** Auto-scroll du fil tant que l'utilisateur n'a pas remonté manuellement. */
	D.state.logStickToBottom = true;
	D.state.toolBlocks = new Map();
	D.state.currentTodoBlockEl = null;
	D.state.todoSnapshot = [];
	D.state.currentActivityGridEl = null;
	D.state.currentWarmupRowEl = null;
	/** Warmup affiché avant `state busy` de l'hôte (juste après envoi). */
	D.state.pendingRunWarmup = false;
	/** Indicateur « ça tourne » en bas du fil architecte (run linéaire). */
	D.state.architectTailActivityEl = null;
	D.state.lastWarmupPhraseIdx = -1;
	/** Flux chat courant (section answer du strip actif). */
	D.state.chatStreamEl = null;
	D.state.chatStreamStripId = '';
	/** Run `architect_discussion` — prose user → section answer (pas thinking). */
	D.state.discussionRunActive = false;
	/** En attente de `userFacingReply` — ne pas démonter le strip sur `busy: false`. */
	D.state.discussionAwaitingCanonicalReply = false;
})(globalThis.DroxChat);
