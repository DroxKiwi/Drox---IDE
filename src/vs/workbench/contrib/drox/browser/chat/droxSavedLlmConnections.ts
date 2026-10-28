/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

export interface IDroxSavedLlmConnection {
	readonly hosting: 'cloud' | 'personal';
	readonly provider: string;
	readonly server: string;
	readonly apiKey: string;
	readonly llmHeaders: Record<string, string>;
}

export function droxSavedLlmConnectionKey(connection: Pick<IDroxSavedLlmConnection, 'hosting' | 'provider' | 'server'>): string {
	return `${connection.hosting}|${connection.provider}|${connection.server.trim()}`;
}

export function parseDroxSavedLlmConnections(raw: unknown): IDroxSavedLlmConnection[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const list: IDroxSavedLlmConnection[] = [];
	const seen = new Set<string>();
	for (const entry of raw) {
		const parsed = parseOne(entry);
		if (!parsed) {
			continue;
		}
		const key = droxSavedLlmConnectionKey(parsed);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		list.push(parsed);
	}
	return list;
}

export function upsertDroxSavedLlmConnection(
	list: readonly IDroxSavedLlmConnection[],
	next: IDroxSavedLlmConnection,
): IDroxSavedLlmConnection[] {
	const key = droxSavedLlmConnectionKey(next);
	const without = list.filter(item => droxSavedLlmConnectionKey(item) !== key);
	return [...without, next];
}

function parseOne(entry: unknown): IDroxSavedLlmConnection | undefined {
	if (!entry || typeof entry !== 'object') {
		return undefined;
	}
	const record = entry as Record<string, unknown>;
	const server = String(record.server ?? '').trim();
	if (!server) {
		return undefined;
	}
	const hosting = record.hosting === 'cloud' ? 'cloud' : 'personal';
	const provider = String(record.provider ?? '').trim() || 'ollama';
	const headers: Record<string, string> = {};
	if (record.llmHeaders && typeof record.llmHeaders === 'object') {
		for (const [name, value] of Object.entries(record.llmHeaders as Record<string, unknown>)) {
			const headerName = name.trim();
			if (!headerName) {
				continue;
			}
			headers[headerName] = String(value ?? '').trim();
		}
	}
	return {
		hosting,
		provider,
		server,
		apiKey: String(record.apiKey ?? '').trim(),
		llmHeaders: headers,
	};
}
