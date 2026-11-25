/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { basename } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IChatSessionFileChange2 } from '../../chat/common/chatSessionsService.js';
import { IGitService } from '../../git/common/gitService.js';
import { ISessionFileChange } from '../../../../sessions/services/sessions/common/session.js';
import { DroxChatSessionUri } from './droxAgentsSession.js';
import { discoverGitRoots, matchGitRootForPath } from './droxDiscoverGitRoots.js';
import { droxChangeEventKey } from './droxChangeEventKey.js';
import { enrichDroxFileChangeSnapshot } from './droxFileChangeProgress.js';
import { IDroxFileChangePayload } from './droxFileChange.js';
import { IDroxSessionChangesDetailService } from './droxSessionChangesDetailService.js';
import { buildAggregatedSessionFileChanges } from './droxSessionChangesAggregate.js';
import {
	collectCommittedChangeEventKeys,
	gitChangesToDirtyPathKeys,
	loadDroxGitUncommittedChangesForRoot,
	mergeDroxSessionFileChanges,
} from './droxSessionGitChanges.js';
import { droxSessionChangePathKey } from './droxPathUtil.js';
import { IDroxSessionService } from './droxSessionService.js';
import { DroxHostToWebviewMessage } from '../browser/droxChatBridge.js';
import { IDroxSessionChangesPanelService } from './droxSessionChangesPanelService.js';

export interface IDroxIdeChangesCategory {
	readonly root: URI | undefined;
	readonly label: string;
	readonly branchLabel: string | undefined;
	readonly changes: readonly ISessionFileChange[];
}

export interface IDroxIdeChangesBuildResult {
	readonly categories: readonly IDroxIdeChangesCategory[];
	readonly branchLabels: readonly string[];
	/** Dirty path keys after this build (for prune across refreshes). */
	readonly dirtyPathKeys: ReadonlySet<string> | undefined;
}

function isFileChangeMessage(message: DroxHostToWebviewMessage): message is DroxHostToWebviewMessage & IDroxFileChangePayload & { kind: 'fileChange' } {
	return message.kind === 'fileChange' && typeof (message as { path?: unknown }).path === 'string';
}

async function loadSessionChangeEvents(opts: {
	readonly workspaceFsPath: string;
	readonly engineSessionId: string;
	readonly detailService: IDroxSessionChangesDetailService;
	readonly sessionService?: IDroxSessionService;
	readonly panelService?: IDroxSessionChangesPanelService;
}): Promise<readonly IDroxFileChangePayload[]> {
	const sessionResource = DroxChatSessionUri.forSession(opts.engineSessionId);
	const raw = opts.detailService.getSessionChangeEvents(sessionResource);
	const existing = opts.panelService ? opts.panelService.filterDismissed(sessionResource, raw) : raw;
	if (existing.length > 0 || !opts.sessionService) {
		return existing;
	}
	try {
		const replay = await opts.sessionService.readUiReplay(opts.engineSessionId, opts.workspaceFsPath);
		const fromReplay: IDroxFileChangePayload[] = [];
		for (const message of replay) {
			if (!isFileChangeMessage(message) || !message.applied) {
				continue;
			}
			fromReplay.push(message);
		}
		if (fromReplay.length > 0) {
			opts.detailService.mergeSessionChangeEvents(sessionResource, fromReplay);
			return opts.detailService.getSessionChangeEvents(sessionResource);
		}
	} catch {
		// ignore hydrate failures
	}
	return existing;
}

function filterEventsToDirtyPaths(
	events: readonly IDroxFileChangePayload[],
	dirtyPathKeys: ReadonlySet<string> | undefined,
): readonly IDroxFileChangePayload[] {
	if (!dirtyPathKeys) {
		return events;
	}
	return events.filter(change => dirtyPathKeys.has(droxSessionChangePathKey(change.path)));
}

/**
 * Build IDE Changes categories (1 section / git root) for the open workspace + session.
 * When Git status is reachable, session-only ghosts (already committed) are dropped.
 */
export async function buildDroxIdeChangesCategories(opts: {
	readonly workspaceFsPath: string;
	readonly engineSessionId: string;
	readonly fileService: IFileService;
	readonly gitService: IGitService;
	readonly detailService: IDroxSessionChangesDetailService;
	readonly sessionService?: IDroxSessionService;
	readonly panelService?: IDroxSessionChangesPanelService;
	readonly previouslyDirtyPathKeys?: ReadonlySet<string>;
}): Promise<IDroxIdeChangesBuildResult> {
	const sessionResource = DroxChatSessionUri.forSession(opts.engineSessionId);
	let events = [...(await loadSessionChangeEvents(opts))]
		.map(change => enrichDroxFileChangeSnapshot(change, opts.workspaceFsPath));

	const roots = await discoverGitRoots(opts.fileService, opts.workspaceFsPath);
	if (roots.length === 0) {
		const sessionChanges = buildAggregatedSessionFileChanges(events);
		return {
			categories: [{
				root: undefined,
				label: 'Changes',
				branchLabel: undefined,
				changes: sessionChanges,
			}],
			branchLabels: [],
			dirtyPathKeys: undefined,
		};
	}

	const allGit: IChatSessionFileChange2[] = [];
	const branchLabels: string[] = [];
	let anyRootReachable = false;
	for (const root of roots) {
		const gitChanges = await loadDroxGitUncommittedChangesForRoot(opts.gitService, root);
		if (gitChanges) {
			anyRootReachable = true;
			allGit.push(...gitChanges);
		}
		const repo = await opts.gitService.openRepository(root);
		const head = repo?.state.get().HEAD?.name;
		if (head) {
			branchLabels.push(roots.length === 1 ? head : `${basename(root)}: ${head}`);
		}
	}

	const dirtyPathKeys = anyRootReachable ? gitChangesToDirtyPathKeys(allGit) : undefined;

	if (dirtyPathKeys && opts.previouslyDirtyPathKeys && opts.previouslyDirtyPathKeys.size > 0) {
		const committedKeys = collectCommittedChangeEventKeys(events, opts.previouslyDirtyPathKeys, dirtyPathKeys);
		if (committedKeys.length > 0) {
			if (opts.panelService) {
				await opts.panelService.dismissChanges(
					sessionResource,
					opts.engineSessionId,
					opts.workspaceFsPath,
					committedKeys,
				);
			} else {
				const keySet = new Set(committedKeys);
				const next = events.filter((change, index) => !keySet.has(droxChangeEventKey(change, index)));
				opts.detailService.setSessionChangeEvents(sessionResource, next);
			}
			events = [...opts.detailService.getSessionChangeEvents(sessionResource)]
				.map(change => enrichDroxFileChangeSnapshot(change, opts.workspaceFsPath));
		}
	}

	// Match Agents: once Git status is known, only keep session paths still dirty.
	const filteredEvents = filterEventsToDirtyPaths(events, dirtyPathKeys);
	const sessionChanges = buildAggregatedSessionFileChanges(filteredEvents);
	const merged = anyRootReachable
		? mergeDroxSessionFileChanges(sessionChanges, allGit)
		: sessionChanges;

	if (roots.length === 1) {
		return {
			categories: [{
				root: roots[0],
				label: basename(roots[0]!),
				branchLabel: branchLabels[0],
				changes: merged,
			}],
			branchLabels,
			dirtyPathKeys,
		};
	}

	return {
		categories: roots.map((root, i) => ({
			root,
			label: basename(root),
			branchLabel: branchLabels[i],
			changes: merged.filter(change => {
				const path = changeFsPath(change);
				if (!path) {
					return false;
				}
				return matchGitRootForPath(roots, path)?.toString() === root.toString();
			}),
		})).filter(cat => cat.changes.length > 0),
		branchLabels,
		dirtyPathKeys,
	};
}

function changeFsPath(change: ISessionFileChange): string | undefined {
	const c = change as IChatSessionFileChange2;
	return (c.modifiedUri ?? c.uri)?.fsPath ?? change.modifiedUri?.fsPath;
}
