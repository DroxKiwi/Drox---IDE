/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { join } from '../../../../base/common/path.js';
import { droxWorkspaceSessionsDir } from './droxWorkspacePaths.js';

/** Fichier journal UI par session (`<workspace>/.drox/sessions/ses_….ui-replay.jsonl`). */
export function droxSessionUiReplayPath(workspaceFsPath: string, sessionId: string): string {
	return join(droxWorkspaceSessionsDir(workspaceFsPath), `${sessionId}.ui-replay.jsonl`);
}

/** Kinds éphémères ou re-synchronisés à l’ouverture — pas rejoués depuis le journal. */
const UI_REPLAY_EXCLUDED_KINDS = new Set<string>([
	'dropHighlight',
	'compact',
	'tabs',
	'sessions',
	'llmModels',
	'modelsLoading',
	'permissionMode',
	'chatReset',
	'sessionReplayDone',
	'replayPrepare',
	'sessionHistory',
	'sessionHistoryPageDone',
	'session',
	'memory',
	'appendReferences',
	'pasteCandidate',
	'prefillPrompt',
	'runRevert',
]);

export function shouldRecordDroxUiReplayMessage(message: { readonly kind: string }): boolean {
	return !UI_REPLAY_EXCLUDED_KINDS.has(message.kind);
}

export function parseDroxUiReplayLine(line: string): Record<string, unknown> | undefined {
	const trimmed = line.trim();
	if (!trimmed) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(trimmed) as Record<string, unknown>;
		if (parsed && typeof parsed.kind === 'string') {
			return parsed;
		}
	} catch {
		/* ligne corrompue */
	}
	return undefined;
}
