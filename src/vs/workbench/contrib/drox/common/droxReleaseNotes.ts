/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../nls.js';
import { StorageScope, StorageTarget, IStorageService } from '../../../../platform/storage/common/storage.js';
import { getDroxProductSemver, DroxProductVersionInfo } from './droxProductVersion.js';

/** Application storage — version des notes déjà « comprises » (hors registre Settings). */
export const DROX_RELEASE_NOTES_SEEN_STORAGE_KEY = 'drox.releaseNotes.seenVersion';

export type DroxReleaseNotesContent = {
	readonly version: string;
	readonly title: string;
	readonly message: string;
	readonly items: readonly string[];
	readonly understoodLabel: string;
};

export function getDroxReleaseNotesProductVersion(product: DroxProductVersionInfo): string {
	const version = getDroxProductSemver(product);
	return version === '?' ? '' : version;
}

export function hasSeenDroxReleaseNotes(storageService: IStorageService, version: string): boolean {
	if (!version) {
		return true;
	}
	const seen = storageService.get(DROX_RELEASE_NOTES_SEEN_STORAGE_KEY, StorageScope.APPLICATION, '');
	return seen === version;
}

export function markDroxReleaseNotesSeen(storageService: IStorageService, version: string): void {
	if (!version) {
		return;
	}
	storageService.store(DROX_RELEASE_NOTES_SEEN_STORAGE_KEY, version, StorageScope.APPLICATION, StorageTarget.USER);
}

export function getDroxReleaseNotesItems(version: string): readonly string[] {
	switch (version) {
		case '1.5.22':
			return [
				localize('drox.releaseNotes.1522.regulation', '**Model regulation** — observatory for L1–L5 notes (context, tools, directive, protocol, retrieval) with optional Auto per lever.'),
				localize('drox.releaseNotes.1522.agents', '**Agents parity** — Codebase and Regulation open from discussion history badges; same services as the IDE, scoped to the session folder.'),
				localize('drox.releaseNotes.1522.catalogue', '**Codebase catalogue** — browse indexed files, exclude paths, rebuild selected entries from the cockpit.'),
				localize('drox.releaseNotes.1522.embed', '**Hardened embed** — bad/binary chunks are skipped with clear alerts; indexing continues for the rest of the project.'),
				localize('drox.releaseNotes.1522.reopen', 'Click the version label in the chat header anytime to reopen these notes.'),
			];
		case '1.5.21':
			return [
				localize('drox.releaseNotes.1521.codebase', '**@Codebase** — local index with auto-inject into agent runs; Force chip anchors retrieval to the active editor file.'),
				localize('drox.releaseNotes.1521.ranking', '**Smarter retrieval** — English model comprehension picks search filters (no keyword heuristics on your message).'),
				localize('drox.releaseNotes.1521.shell', '**Shared discussion shell** — IDE and Agents share the same composer tools (model, server, settings).'),
				localize('drox.releaseNotes.1521.loops', '**Loop guard** — repeated bash/grep retries with only cosmetic changes are nudged then aborted.'),
				localize('drox.releaseNotes.1521.reopen', 'Click the version label in the chat header anytime to reopen these notes.'),
			];
		case '1.5.19':
			return [
				localize('drox.releaseNotes.1519.graph', '**Native Git Graph** — explore commits and branches in-product (parity with the classic Git Graph extension), with the branch badge always visible.'),
				localize('drox.releaseNotes.1519.handoff', '**Agents → IDE handoff** — opening a session in the IDE from Agents no longer times out on an empty chat; the thread loads via a one-shot session handoff.'),
				localize('drox.releaseNotes.1519.ollama', '**Ollama / agent stability** — schema `$ref` inlining, system-message order for Jinja templates, and smarter loop detection while the model is thinking.'),
				localize('drox.releaseNotes.1519.reopen', 'Click the version label in the chat header anytime to reopen these notes.'),
			];
		case '1.5.18':
			return [
				localize('drox.releaseNotes.1518.resume', '**Resume last chat** — reopening the app restores your last conversation (stable layout + MRU), instead of always starting empty.'),
				localize('drox.releaseNotes.1518.loading', '**IDE loading fixed** — the native Drox panel no longer sticks on “Loading session…”; history loads from the open workspace folder.'),
				localize('drox.releaseNotes.1518.stop', '**Smarter stop** — cancel before the model answers puts your message back in the input; cancel mid-reply keeps the partial turn on screen.'),
				localize('drox.releaseNotes.1518.edit', '**Edit last message** — change your last prompt and choose **Keep partial** or **Discard & restart** when a reply was interrupted.'),
				localize('drox.releaseNotes.1518.reopen', 'Click the version label in the chat header anytime to reopen these notes.'),
			];
		case '1.5.11':
			return [
				localize('drox.releaseNotes.1511.native', '**Native chat** — the IDE **Drox** panel and the **Agents window** use the same `drox.exe` stack (legacy webview tab hidden by default; enable with `drox.ideLegacyWebviewChat.enabled`). Streamed replies, tools, cancel, and blocking questions — no Copilot account.'),
				localize('drox.releaseNotes.1511.cfg', '**Shared settings** — server, model, and permission mode are stored once (user scope) and stay in sync between the IDE and the Agents window.'),
				localize('drox.releaseNotes.1511.history', '**Session history** — reopen `.drox/sessions` from the IDE Native tab or the Agents sidebar; picks stay aligned across both surfaces.'),
				localize('drox.releaseNotes.1511.diffs', '**File changes in the native thread** — inline diff cards with undo/redo (same engine path as Drox Chat).'),
				localize('drox.releaseNotes.1511.open', '**Open in Agents** — title bar shortcut to jump from the editor to the Agents window with the same project.'),
				localize('drox.releaseNotes.1511.reopen', 'Click the version label in the chat header anytime to reopen these notes.'),
			];
		case '1.5.10':
			return [
				localize('drox.releaseNotes.1510.recovery', '**Run recovery always on** — **Resume** and **Restart** stay on your last user message during a run, after cancel, or after an LLM error. **Restart** works even while busy (stop + clean retry).'),
				localize('drox.releaseNotes.1510.persist', '**Recovery after reload** — reopening a session restores the buttons on the last user message (saved under `.drox/sessions/`).'),
				localize('drox.releaseNotes.1510.respawn', '**Model change mid-run** — engine respawn is deferred until the run finishes (no more `drox client closed`).'),
				localize('drox.releaseNotes.1510.metrics', '**Live token metrics** — the `↑ ↓ ctx` bar updates during the run, not only at the end.'),
				localize('drox.releaseNotes.1510.composer', '**Composer padding** — placeholder and text are no longer flush against the input border.'),
				localize('drox.releaseNotes.1510.reopen', 'Click the version label in the chat header anytime to reopen these notes.'),
			];
		case '1.5.9':
			return [
				localize('drox.releaseNotes.159.scroll', '**Smarter scroll** — while the model streams, the thread stays put if you scroll up to read; it follows new output again when you return to the bottom.'),
				localize('drox.releaseNotes.159.reset', '**Workspace reset** (Sessions panel) now also deletes root `MEMORY.md` along with `.drox/sessions` and other workspace Drox data.'),
				localize('drox.releaseNotes.159.composer', '**Cleaner composer** — removed the four redundant icons under the input (settings, folder, attach, reload). Use the Settings vignette, `@` paths, and drag-and-drop instead.'),
				localize('drox.releaseNotes.159.reopen', 'Click the version label in the chat header anytime to reopen these notes.'),
			];
		case '1.5.7':
			return [
				localize('drox.releaseNotes.157.recovery', 'When an LLM error cuts a run short, **Resume** and **Restart** appear on your last user message.'),
				localize('drox.releaseNotes.157.resume', '**Resume** continues from the last checkpoint (partial model output kept).'),
				localize('drox.releaseNotes.157.restart', '**Restart** clears everything the model said since that message and tries again.'),
				localize('drox.releaseNotes.157.paste', '**Smart paste** — send messages with linked code snippets again (composer chips).'),
				localize('drox.releaseNotes.157.chat', 'Session reload and history replay no longer block sending new messages.'),
				localize('drox.releaseNotes.157.engine', 'Engine: `skipUserTurn` resume path and `session.truncateAfterLastUser` for a clean retry.'),
				localize('drox.releaseNotes.157.reopen', 'Click the version label in the chat header anytime to reopen these notes.'),
			];
		case '1.5.6':
			return [
				localize('drox.releaseNotes.156.user', 'User bubble shows immediately on send — including after a network error or session resume.'),
				localize('drox.releaseNotes.156.diffs', 'File diff cards scroll internally again instead of stretching the whole thread.'),
				localize('drox.releaseNotes.156.routing', 'Assistant replies are no longer lost after the optimistic user bubble.'),
				localize('drox.releaseNotes.156.warmup', 'Warmup grid + phrase stay visible for the whole run; grid reserved for that line only.'),
				localize('drox.releaseNotes.156.send', 'Square TUI send button with pulse animation while a run is active.'),
				localize('drox.releaseNotes.156.reopen', 'Click the version label in the chat header anytime to reopen these notes.'),
			];
		case '1.5.4':
			return [
				localize('drox.releaseNotes.154.linux', 'Official Linux amd64 `.deb` alongside the Windows installer.'),
				localize('drox.releaseNotes.154.openvsx', 'Extension gallery via Open VSX — search and install from the Extensions view.'),
				localize('drox.releaseNotes.154.openwith', '“Open with Drox” context menu on Windows and Linux (files and folders).'),
				localize('drox.releaseNotes.154.vscode', 'VS Code base updated to **1.127.0**.'),
				localize('drox.releaseNotes.154.ask', 'Blocking questionnaire (`ask_user_question`): multi-question forms keep all answers, including when the model sends JSON as a string.'),
				localize('drox.releaseNotes.154.tui', 'Chat TUI polish: square frames for questionnaires and plan cards.'),
				localize('drox.releaseNotes.154.reopen', 'Click the version label in the chat header anytime to reopen these notes.'),
			];
		case '1.5.3':
			return [
				localize('drox.releaseNotes.153.diffs', 'File edits appear inline in the chat thread with unified diffs, undo, and redo on each card.'),
				localize('drox.releaseNotes.153.shell', 'Shell commands (bash / PowerShell) use dedicated cards with command, stdout/stderr, and exit code — no raw JSON.'),
				localize('drox.releaseNotes.153.user', 'User messages: copy button, inline expand for long text, and a discreet commit reminder above each bubble.'),
				localize('drox.releaseNotes.153.composer', 'Composer textarea grows automatically from 2 to 12 lines and uses the full panel width.'),
				localize('drox.releaseNotes.153.tui', 'Chat thread retro TUI look: VT323 font, phosphor greens, sharp corners, flush to the panel edge.'),
				localize('drox.releaseNotes.153.work', 'WORK strip fixes: stable plan, reasoning counters, no duplicate text, activity grid cleared after runs.'),
				localize('drox.releaseNotes.153.sessions', 'Session history: cleaner list (no ui-replay duplicates) and full UI replay when reopening a session.'),
				localize('drox.releaseNotes.153.reopen', 'Click the version label in the chat header anytime to reopen these notes.'),
			];
		case '1.5.2':
			return [
				localize('drox.releaseNotes.152.engine', 'Engine configuration is aligned with the TUI contract (tui_mono / agent.run).'),
				localize('drox.releaseNotes.152.architect', 'Architect panel: full sampling parameters and keep_alive are available in release builds.'),
				localize('drox.releaseNotes.152.general', 'General panel: max_iterations (default 50) is always visible.'),
				localize('drox.releaseNotes.152.purge', 'Removed legacy 1.4 settings (orchestration mode, engine.tuning.*, architect interaction mode).'),
				localize('drox.releaseNotes.152.reopen', 'Click the version label in the chat header anytime to reopen these notes.'),
			];
		default:
			return [
				localize('drox.releaseNotes.genericDetail', 'See the release documentation for changes in Drox {0}.', version),
			];
	}
}

/** @deprecated Préférer `getDroxReleaseNotesItems` — conservé pour les tests. */
export function getDroxReleaseNotesDetail(version: string): string {
	return getDroxReleaseNotesItems(version).join('\n\n');
}

export function getDroxReleaseNotesLeadMessage(version: string): string {
	switch (version) {
		case '1.5.21':
			return localize(
				'drox.releaseNotes.1521.message',
				'Local @Codebase auto-inject with Force-to-editor, smarter retrieval, shared IDE/Agents discussion tools, and stronger bash/grep loop guards.',
			);
		case '1.5.19':
			return localize(
				'drox.releaseNotes.1519.message',
				'Native Git Graph and branch badge, reliable Agents → IDE chat handoff, and tougher Ollama / agent loop handling.',
			);
		case '1.5.18':
			return localize(
				'drox.releaseNotes.1518.message',
				'Session resume on restart, reliable IDE chat loading, and inline stop / edit for interrupted turns.',
			);
		case '1.5.11':
			return localize(
				'drox.releaseNotes.1511.message',
				'Native Drox chat in the IDE and Agents window — one local engine, one model setting, shared session history.',
			);
		case '1.5.10':
			return localize(
				'drox.releaseNotes.1510.message',
				'Recover runs without hunting for errors: Resume or Restart stays on your last message, even after you restart the app.',
			);
		case '1.5.9':
			return localize(
				'drox.releaseNotes.159.message',
				'Read the thread at your own pace: scroll no longer jumps to the bottom during a run unless you are already there.',
			);
		case '1.5.7':
			return localize(
				'drox.releaseNotes.157.message',
				'Recover interrupted runs: resume from the cutoff or restart cleanly after an LLM error.',
			);
		case '1.5.6':
			return localize(
				'drox.releaseNotes.156.message',
				'Chat polish: instant user bubbles, scrollable diffs, reliable assistant routing, and a clearer run indicator.',
			);
		case '1.5.4':
			return localize(
				'drox.releaseNotes.154.message',
				'Linux release, Open VSX, “Open with Drox”, VS Code 1.127 — and a fix for multi-question forms in chat.',
			);
		case '1.5.3':
			return localize(
				'drox.releaseNotes.153.message',
				'Richer agent thread: inline file diffs, shell cards, user-message polish, retro TUI styling, and session replay fixes.',
			);
		case '1.5.2':
			return localize(
				'drox.releaseNotes.152.message',
				'This update adjusts engine configuration and removes obsolete 1.4 settings.',
			);
		default:
			return localize(
				'drox.releaseNotes.genericMessage',
				'Welcome to Drox {0}.',
				version,
			);
	}
}

export function buildDroxReleaseNotesContent(version: string): DroxReleaseNotesContent | undefined {
	if (!version) {
		return undefined;
	}
	return {
		version,
		title: localize('drox.releaseNotes.title', "What's new in Drox {0}", version),
		message: getDroxReleaseNotesLeadMessage(version),
		items: getDroxReleaseNotesItems(version),
		understoodLabel: localize('drox.releaseNotes.understood', 'Understood'),
	};
}
