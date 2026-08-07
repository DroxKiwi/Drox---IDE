/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { isListableDroxSessionId } from './droxSession.js';

/** One-shot Agents → IDE session handoff (shared across IDE ↔ Sessions). */
export const DROX_PENDING_IDE_SESSION_HANDOFF_KEY = 'drox.pendingIdeSessionHandoff';

/** Ignore stale handoffs older than this (ms). */
export const DROX_IDE_SESSION_HANDOFF_MAX_AGE_MS = 5 * 60_000;

export interface IDroxIdeSessionHandoff {
	readonly workspaceFsPath: string;
	readonly sessionId: string;
	readonly ts: number;
}

function normalizeWorkspaceKey(workspaceFsPath: string): string {
	return workspaceFsPath.replace(/\\/g, '/').toLowerCase();
}

function parseHandoff(raw: string | undefined): IDroxIdeSessionHandoff | undefined {
	if (!raw) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(raw) as Partial<IDroxIdeSessionHandoff>;
		const workspaceFsPath = typeof parsed.workspaceFsPath === 'string' ? parsed.workspaceFsPath.trim() : '';
		const sessionId = typeof parsed.sessionId === 'string' ? parsed.sessionId.trim() : '';
		const ts = typeof parsed.ts === 'number' ? parsed.ts : NaN;
		if (!workspaceFsPath || !isListableDroxSessionId(sessionId) || !Number.isFinite(ts)) {
			return undefined;
		}
		return { workspaceFsPath, sessionId, ts };
	} catch {
		return undefined;
	}
}

/**
 * Persist the active Agents engine session so Native Chat IDE can open the same discussion.
 * Uses APPLICATION_SHARED (IDE ↔ Sessions), not profile storage.
 */
export function writeDroxIdeSessionHandoff(
	storageService: IStorageService,
	workspaceFsPath: string,
	sessionId: string,
	now = Date.now(),
): boolean {
	const ws = workspaceFsPath.trim();
	const id = sessionId.trim();
	if (!ws || !isListableDroxSessionId(id)) {
		return false;
	}
	const payload: IDroxIdeSessionHandoff = {
		workspaceFsPath: ws,
		sessionId: id,
		ts: now,
	};
	storageService.store(
		DROX_PENDING_IDE_SESSION_HANDOFF_KEY,
		JSON.stringify(payload),
		StorageScope.APPLICATION_SHARED,
		StorageTarget.MACHINE,
	);
	return true;
}

/**
 * Read and clear a pending handoff when it matches `workspaceFsPath` and is fresh.
 * Returns undefined (without clearing) when the workspace does not match.
 */
export function consumeDroxIdeSessionHandoff(
	storageService: IStorageService,
	workspaceFsPath: string,
	now = Date.now(),
): string | undefined {
	const raw = storageService.get(DROX_PENDING_IDE_SESSION_HANDOFF_KEY, StorageScope.APPLICATION_SHARED);
	const handoff = parseHandoff(raw);
	if (!handoff) {
		if (raw) {
			storageService.remove(DROX_PENDING_IDE_SESSION_HANDOFF_KEY, StorageScope.APPLICATION_SHARED);
		}
		return undefined;
	}

	if (normalizeWorkspaceKey(handoff.workspaceFsPath) !== normalizeWorkspaceKey(workspaceFsPath)) {
		return undefined;
	}

	storageService.remove(DROX_PENDING_IDE_SESSION_HANDOFF_KEY, StorageScope.APPLICATION_SHARED);

	if (now - handoff.ts > DROX_IDE_SESSION_HANDOFF_MAX_AGE_MS) {
		return undefined;
	}

	return handoff.sessionId;
}

/** Peek without consuming (for tests / diagnostics). */
export function peekDroxIdeSessionHandoff(storageService: IStorageService): IDroxIdeSessionHandoff | undefined {
	return parseHandoff(storageService.get(DROX_PENDING_IDE_SESSION_HANDOFF_KEY, StorageScope.APPLICATION_SHARED));
}
