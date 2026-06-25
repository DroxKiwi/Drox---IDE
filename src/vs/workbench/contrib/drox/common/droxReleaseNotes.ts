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
