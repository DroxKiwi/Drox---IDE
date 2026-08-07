/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { comparePaths } from '../../../../base/common/comparers.js';
import { URI } from '../../../../base/common/uri.js';
import { IChatSessionFileChange2, isIChatSessionFileChange2 } from '../../chat/common/chatSessionsService.js';
import { GitDiffChange, IGitRepository, IGitService } from '../../git/common/gitService.js';
import { ISessionFileChange, ISessionWorkspace } from '../../../../sessions/services/sessions/common/session.js';
import { droxChangeEventKey } from './droxChangeEventKey.js';
import { IDroxFileChangePayload } from './droxFileChange.js';
import { droxSessionChangePathKey } from './droxPathUtil.js';

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

async function openDroxGitRepository(
	gitService: IGitService,
	workspace: ISessionWorkspace | undefined,
): Promise<IGitRepository | undefined> {
	const folder = workspace?.folders[0];
	const repositoryUri = folder?.gitRepository?.workTreeUri
		?? folder?.gitRepository?.uri
		?? folder?.root;
	if (!repositoryUri) {
		return undefined;
	}
	return gitService.openRepository(repositoryUri);
}

/**
 * Fichiers uncommitted Git du workspace (HEAD → working tree + untracked).
 * Retourne `undefined` si le dépôt n'est pas joignable (ne pas traiter comme working tree propre).
 *
 * Note: `diffBetweenWithStats2` ignore les untracked — on les ajoute depuis `repository.state`.
 */
export async function loadDroxGitUncommittedChanges(
	gitService: IGitService,
	workspace: ISessionWorkspace | undefined,
): Promise<IChatSessionFileChange2[] | undefined> {
	const repository = await openDroxGitRepository(gitService, workspace);
	if (!repository) {
		return undefined;
	}
	const changes = await repository.diffBetweenWithStats2('HEAD');
	const byKey = new Map<string, IChatSessionFileChange2>();
	for (const change of gitDiffToSessionFileChanges(changes, 'HEAD', undefined)) {
		const uri = sessionFileUri(change);
		if (!uri) {
			continue;
		}
		byKey.set(droxSessionChangePathKey(uri.fsPath), change);
	}

	const state = repository.state.get();
	for (const change of [
		...state.indexChanges,
		...state.workingTreeChanges,
		...state.untrackedChanges,
		...state.mergeChanges,
	]) {
		const uri = change.modifiedUri ?? change.uri;
		const key = droxSessionChangePathKey(uri.fsPath);
		if (byKey.has(key)) {
			continue;
		}
		// Untracked / status-only: stats come from agent session events in merge.
		byKey.set(key, {
			uri,
			originalUri: change.originalUri,
			modifiedUri: change.modifiedUri ?? uri,
			insertions: 0,
			deletions: 0,
		});
	}

	return [...byKey.values()];
}

/** Chemins dirty (index + WT + untracked + merge). `undefined` si dépôt inaccessible. */
export async function loadDroxGitDirtyPathKeys(
	gitService: IGitService,
	workspace: ISessionWorkspace | undefined,
): Promise<Set<string> | undefined> {
	const repository = await openDroxGitRepository(gitService, workspace);
	if (!repository) {
		return undefined;
	}
	const dirty = new Set<string>();
	const state = repository.state.get();
	for (const change of [
		...state.indexChanges,
		...state.workingTreeChanges,
		...state.untrackedChanges,
		...state.mergeChanges,
	]) {
		dirty.add(droxSessionChangePathKey((change.modifiedUri ?? change.uri).fsPath));
	}
	return dirty;
}

function sessionFileUri(change: ISessionFileChange): URI | undefined {
	if (isIChatSessionFileChange2(change)) {
		return change.modifiedUri ?? change.uri;
	}
	return change.modifiedUri;
}

/**
 * Fusionne changements agent Drox + uncommitted Git.
 *
 * - Fichiers présents dans Git (tracked dirty / untracked status) : stats Git si non nulles,
 *   sinon stats agent ; URI snapshot agent conservée.
 * - Fichiers agent seuls : conservés (untracked pas encore dans le status Git, ou latence).
 */
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
		const sessionOriginalUri = isIChatSessionFileChange2(sessionChange) && sessionChange.originalUri
			? sessionChange.originalUri
			: sessionChange.originalUri;
		const sessionModifiedUri = isIChatSessionFileChange2(sessionChange)
			? (sessionChange.modifiedUri ?? sessionChange.uri)
			: sessionChange.modifiedUri ?? uri;

		if (!gitEntry) {
			map.set(key, {
				uri,
				originalUri: sessionOriginalUri,
				modifiedUri: sessionModifiedUri,
				insertions: sessionChange.insertions,
				deletions: sessionChange.deletions,
			});
			continue;
		}

		const gitHasStats = gitEntry.insertions > 0 || gitEntry.deletions > 0;
		map.set(key, {
			uri,
			originalUri: sessionOriginalUri ?? gitEntry.originalUri,
			modifiedUri: gitEntry.modifiedUri ?? sessionModifiedUri ?? uri,
			insertions: gitHasStats ? gitEntry.insertions : sessionChange.insertions,
			deletions: gitHasStats ? gitEntry.deletions : sessionChange.deletions,
		});
	}

	return [...map.values()].sort((a, b) => comparePaths(a.uri.fsPath, b.uri.fsPath));
}

/**
 * Clés d'events à retirer : chemins qui étaient dirty et ne le sont plus
 * (commit / discard). Ne jamais traiter « absent du diff HEAD » comme commité —
 * les untracked n'y figurent pas.
 */
export function collectCommittedChangeEventKeys(
	events: readonly IDroxFileChangePayload[],
	previouslyDirtyPathKeys: ReadonlySet<string>,
	currentlyDirtyPathKeys: ReadonlySet<string>,
): string[] {
	const keys: string[] = [];
	for (let i = 0; i < events.length; i++) {
		const change = events[i]!;
		const pathKey = droxSessionChangePathKey(change.path);
		if (previouslyDirtyPathKeys.has(pathKey) && !currentlyDirtyPathKeys.has(pathKey)) {
			keys.push(droxChangeEventKey(change, i));
		}
	}
	return keys;
}

export function gitChangesToDirtyPathKeys(gitChanges: readonly IChatSessionFileChange2[]): Set<string> {
	const dirty = new Set<string>();
	for (const change of gitChanges) {
		const uri = sessionFileUri(change);
		if (uri) {
			dirty.add(droxSessionChangePathKey(uri.fsPath));
		}
	}
	return dirty;
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
