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

export function buildDroxReleaseNotesContent(version: string): DroxReleaseNotesContent | undefined {
	if (!version) {
		return undefined;
	}
	return {
		version,
		title: localize('drox.releaseNotes.title', "What's new in Drox {0}", version),
		message: localize(
			'drox.releaseNotes.message',
			'This update adjusts engine configuration and removes obsolete 1.4 settings.',
		),
		items: getDroxReleaseNotesItems(version),
		understoodLabel: localize('drox.releaseNotes.understood', 'Understood'),
	};
}
