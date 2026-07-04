/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { isListableDroxSessionId } from './droxSession.js';
import { droxSessionChangesPanelPath } from './droxSessionChangesPanelStore.js';
import { droxSessionRunRecoveryPath } from './droxRunRecoveryPersist.js';
import { droxSessionUiReplayPath } from './droxUiReplayJournal.js';
import { droxWorkspaceSessionsDir } from './droxWorkspacePaths.js';

/** Chemins connus des artefacts d'une session Drox dans `.drox/sessions/`. */
export function droxSessionArtifactPaths(workspaceFsPath: string, sessionId: string): readonly string[] {
	const sessionsDir = droxWorkspaceSessionsDir(workspaceFsPath);
	return [
		join(sessionsDir, `${sessionId}.jsonl`),
		join(sessionsDir, `${sessionId}.meta.json`),
		join(sessionsDir, `${sessionId}.ui-stats.json`),
		droxSessionUiReplayPath(workspaceFsPath, sessionId),
		droxSessionRunRecoveryPath(workspaceFsPath, sessionId),
		droxSessionChangesPanelPath(workspaceFsPath, sessionId),
	];
}

/** Supprime les fichiers persistés d'une session moteur (`ses_*`). */
export async function deleteDroxSessionOnDisk(
	fileService: IFileService,
	workspaceFsPath: string,
	sessionId: string,
): Promise<void> {
	if (!isListableDroxSessionId(sessionId)) {
		return;
	}
	for (const path of droxSessionArtifactPaths(workspaceFsPath, sessionId)) {
		const uri = URI.file(path);
		try {
			if (await fileService.exists(uri)) {
				await fileService.del(uri, { recursive: false, useTrash: false });
			}
		} catch {
			/* best-effort — la session est retirée de l'UI même si un artefact résiste */
		}
	}
}
