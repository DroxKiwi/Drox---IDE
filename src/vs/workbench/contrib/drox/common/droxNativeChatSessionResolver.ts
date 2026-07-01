/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { deriveTitleFromTranscriptMessages, IDroxSessionListEntry } from './droxSession.js';
import { IDroxSessionService } from './droxSessionService.js';
import { sortDroxSessionEntriesByRecency } from './droxSharedChatSessionHistory.js';
import { localize } from '../../../../nls.js';
import { sessionDateFromNow } from '../../chat/browser/agentSessions/agentSessionsViewer.js';

export interface IDroxNativeChatSessionResolverInput {
	readonly workspaceFsPath: string;
	readonly sessionService: IDroxSessionService;
	readonly persistedNativeSessionId?: string;
	readonly webviewActiveTabId?: string | null;
	/** Ordre MRU partagé IDE ↔ Agents. */
	readonly recencySessionIds?: readonly string[];
	readonly createNewSessionId: () => string;
}

/**
 * Choisit la session moteur à rouvrir au démarrage de l’onglet Native :
 * 1. dernière session native persistée (si encore listée)
 * 2. onglet actif webview (layout partagé workspace)
 * 3. ordre MRU partagé IDE ↔ Agents
 * 4. session la plus récente sur disque
 * 5. nouvelle session
 */
export async function resolveDroxNativeChatStartupSessionId(
	input: IDroxNativeChatSessionResolverInput,
): Promise<{ readonly sessionId: string; readonly entries: readonly IDroxSessionListEntry[] }> {
	const rawEntries = await input.sessionService.listSessions(input.workspaceFsPath);
	const recency = input.recencySessionIds ?? [];
	const entries = sortDroxSessionEntriesByRecency(rawEntries, recency);
	const known = new Set(entries.map(e => e.id));

	for (const candidate of [
		input.persistedNativeSessionId,
		input.webviewActiveTabId ?? undefined,
		...recency,
	]) {
		if (candidate && known.has(candidate)) {
			return { sessionId: candidate, entries };
		}
	}

	if (entries[0]) {
		return { sessionId: entries[0].id, entries };
	}

	return { sessionId: input.createNewSessionId(), entries };
}

export function formatDroxSessionListLabel(entry: IDroxSessionListEntry): string {
	const title = entry.title?.trim();
	if (title) {
		return title.length > 80 ? `${title.slice(0, 77)}…` : title;
	}
	const when = sessionDateFromNow(entry.modifiedSecs * 1000);
	return localize('drox.session.untitledListLabel', 'Chat · {0}', when);
}

const MAX_TITLE_ENRICH = 30;

/** Complète les titres manquants à partir du premier message utilisateur du transcript. */
export async function enrichDroxSessionListEntries(
	sessionService: IDroxSessionService,
	workspaceFsPath: string,
	entries: readonly IDroxSessionListEntry[],
): Promise<IDroxSessionListEntry[]> {
	const out: IDroxSessionListEntry[] = [];
	let enriched = 0;
	for (const entry of entries) {
		if (entry.title?.trim() || enriched >= MAX_TITLE_ENRICH) {
			out.push(entry);
			continue;
		}
		try {
			const read = await sessionService.readSession(entry.id, workspaceFsPath);
			const derived = deriveTitleFromTranscriptMessages(read.messages);
			if (derived) {
				out.push({ ...entry, title: derived });
				enriched++;
				continue;
			}
		} catch {
			// ignore — garde le libellé de repli
		}
		out.push(entry);
	}
	return out;
}
