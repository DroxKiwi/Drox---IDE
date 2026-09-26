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
import { enrichDroxFileChangeSnapshot } from './droxFileChangeProgress.js';
import { IDroxFileChangePayload } from './droxFileChange.js';
import { IDroxSessionChangesDetailService } from './droxSessionChangesDetailService.js';
import { buildAggregatedSessionFileChanges } from './droxSessionChangesAggregate.js';
import {
	loadDroxGitUncommittedChangesForRoot,
	mergeDroxSessionFileChanges,
} from './droxSessionGitChanges.js';
import { IDroxSessionService } from './droxSessionService.js';
import { DroxHostToWebviewMessage } from '../browser/droxChatBridge.js';

export interface IDroxIdeChangesCategory {
	readonly root: URI | undefined;
	readonly label: string;
	readonly changes: readonly ISessionFileChange[];
}

function isFileChangeMessage(message: DroxHostToWebviewMessage): message is DroxHostToWebviewMessage & IDroxFileChangePayload & { kind: 'fileChange' } {
	return message.kind === 'fileChange' && typeof (message as { path?: unknown }).path === 'string';
}

async function loadSessionChangeEvents(opts: {
	readonly workspaceFsPath: string;
	readonly engineSessionId: string;
	readonly detailService: IDroxSessionChangesDetailService;
	readonly sessionService?: IDroxSessionService;
}): Promise<readonly IDroxFileChangePayload[]> {
	const sessionResource = DroxChatSessionUri.forSession(opts.engineSessionId);
	const existing = opts.detailService.getSessionChangeEvents(sessionResource);
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

/**
 * Build IDE Changes categories (1 section / git root) for the open workspace + session.
 */
export async function buildDroxIdeChangesCategories(opts: {
	readonly workspaceFsPath: string;
	readonly engineSessionId: string;
	readonly fileService: IFileService;
	readonly gitService: IGitService;
	readonly detailService: IDroxSessionChangesDetailService;
	readonly sessionService?: IDroxSessionService;
}): Promise<readonly IDroxIdeChangesCategory[]> {
	const events = (await loadSessionChangeEvents(opts))
		.map(change => enrichDroxFileChangeSnapshot(change, opts.workspaceFsPath));
	const sessionChanges = buildAggregatedSessionFileChanges(events);

	const roots = await discoverGitRoots(opts.fileService, opts.workspaceFsPath);
	if (roots.length === 0) {
		return [{
			root: undefined,
			label: 'Changes',
			changes: sessionChanges,
		}];
	}

	const allGit: IChatSessionFileChange2[] = [];
	for (const root of roots) {
		const gitChanges = await loadDroxGitUncommittedChangesForRoot(opts.gitService, root);
		if (gitChanges) {
			allGit.push(...gitChanges);
		}
	}
	const merged = mergeDroxSessionFileChanges(sessionChanges, allGit);

	if (roots.length === 1) {
		return [{
			root: roots[0],
			label: basename(roots[0]!),
			changes: merged,
		}];
	}

	return roots.map(root => ({
		root,
		label: basename(root),
		changes: merged.filter(change => {
			const path = changeFsPath(change);
			if (!path) {
				return false;
			}
			return matchGitRootForPath(roots, path)?.toString() === root.toString();
		}),
	})).filter(cat => cat.changes.length > 0);
}

function changeFsPath(change: ISessionFileChange): string | undefined {
	const c = change as IChatSessionFileChange2;
	return (c.modifiedUri ?? c.uri)?.fsPath ?? change.modifiedUri?.fsPath;
}
