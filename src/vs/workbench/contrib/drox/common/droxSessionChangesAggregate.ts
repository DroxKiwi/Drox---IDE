/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../base/common/uri.js';
import { IDroxFileChangePayload } from './droxFileChange.js';
import { ISessionFileChange } from '../../../../sessions/services/sessions/common/session.js';
import { normalizeWindowsFsPath } from './droxPathUtil.js';

export function buildAggregatedSessionFileChanges(events: readonly IDroxFileChangePayload[]): ISessionFileChange[] {
	const byUri = new Map<string, ISessionFileChange>();
	for (const change of events) {
		if (!change.applied) {
			continue;
		}
		const uri = URI.file(normalizeWindowsFsPath(change.path));
		const key = uri.toString();
		const previous = byUri.get(key);
		const snapshotUri = change.beforeSnapshotUri ? URI.parse(change.beforeSnapshotUri) : undefined;
		const originalUri = snapshotUri ?? previous?.originalUri;
		const isDeletion = change.op === 'delete';
		byUri.set(key, {
			uri,
			originalUri,
			modifiedUri: isDeletion ? undefined : uri,
			insertions: (previous?.insertions ?? 0) + change.added,
			deletions: (previous?.deletions ?? 0) + change.removed,
		});
	}
	return [...byUri.values()];
}
