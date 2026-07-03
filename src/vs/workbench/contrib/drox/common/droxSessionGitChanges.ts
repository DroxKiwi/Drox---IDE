/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { comparePaths } from '../../../../base/common/comparers.js';
import { URI } from '../../../../base/common/uri.js';
import { IChatSessionFileChange2, isIChatSessionFileChange2 } from '../../chat/common/chatSessionsService.js';
import { GitDiffChange, IGitService } from '../../git/common/gitService.js';
import { ISessionFileChange, ISessionWorkspace } from '../../../../sessions/services/sessions/common/session.js';

function gitDiffToSessionFileChanges(
	changes: readonly GitDiffChange[],
	originalRef: string | undefined,
	modifiedRef: string | undefined,
): IChatSessionFileChange2[] {
	return changes.map(change => ({
		uri: change.uri,
		originalUri: change.originalUri
			? originalRef
				? change.originalUri.with({ scheme: 'git', query: JSON.stringify({ path: change.originalUri.fsPath, ref: originalRef }) })
				: change.originalUri
			: undefined,
		modifiedUri: change.modifiedUri
			? modifiedRef
				? change.modifiedUri.with({ scheme: 'git', query: JSON.stringify({ path: change.modifiedUri.fsPath, ref: modifiedRef }) })
				: change.modifiedUri
			: undefined,
		insertions: change.insertions,
		deletions: change.deletions,
	} satisfies IChatSessionFileChange2));
}

/** Fichiers uncommitted Git du workspace (HEAD → working tree). */
export async function loadDroxGitUncommittedChanges(
	gitService: IGitService,
	workspace: ISessionWorkspace | undefined,
): Promise<IChatSessionFileChange2[]> {
	const gitRepository = workspace?.folders[0]?.gitRepository;
	const repositoryUri = gitRepository?.workTreeUri ?? gitRepository?.uri;
	if (!repositoryUri) {
		return [];
	}
	const repository = await gitService.openRepository(repositoryUri);
	if (!repository) {
		return [];
	}
	const changes = await repository.diffBetweenWithStats2('HEAD');
	return gitDiffToSessionFileChanges(changes, 'HEAD', undefined);
}

function sessionFileUri(change: ISessionFileChange): URI | undefined {
	if (isIChatSessionFileChange2(change)) {
		return change.modifiedUri ?? change.uri;
	}
	return change.modifiedUri;
}

/** Fusionne changements agent Drox + uncommitted Git (union par fichier). */
export function mergeDroxSessionFileChanges(
	sessionChanges: readonly ISessionFileChange[],
	gitChanges: readonly IChatSessionFileChange2[],
): IChatSessionFileChange2[] {
	const map = new Map<string, IChatSessionFileChange2>();

	for (const gitChange of gitChanges) {
		const uri = sessionFileUri(gitChange);
		if (!uri) {
			continue;
		}
		map.set(uri.toString(), { ...gitChange, uri });
	}

	for (const sessionChange of sessionChanges) {
		const uri = sessionFileUri(sessionChange);
		if (!uri) {
			continue;
		}
		const key = uri.toString();
		const gitEntry = map.get(key);
		const originalUri = isIChatSessionFileChange2(sessionChange) && sessionChange.originalUri
			? sessionChange.originalUri
			: gitEntry?.originalUri;
		const modifiedUri = isIChatSessionFileChange2(sessionChange)
			? (sessionChange.modifiedUri ?? sessionChange.uri)
			: sessionChange.modifiedUri ?? uri;
		map.set(key, {
			uri,
			originalUri,
			modifiedUri,
			insertions: sessionChange.insertions || gitEntry?.insertions || 0,
			deletions: sessionChange.deletions || gitEntry?.deletions || 0,
		});
	}

	return [...map.values()].sort((a, b) => comparePaths(a.uri.fsPath, b.uri.fsPath));
}

export function countDroxSessionFileChangeStats(changes: readonly ISessionFileChange[]): { files: number; added: number; removed: number } {
	let added = 0;
	let removed = 0;
	for (const change of changes) {
		added += change.insertions;
		removed += change.deletions;
	}
	return { files: changes.length, added, removed };
}
