/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IDroxParsedSlashCommand {
	readonly command: string;
	readonly args: string;
}

/** Parse a single-line `/command` (no multi-line body). */
export function parseSlashCommand(raw: string): IDroxParsedSlashCommand | null {
	const trimmed = raw.trim();
	if (!trimmed.startsWith('/')) {
		return null;
	}
	const firstNl = trimmed.indexOf('\n');
	const head = firstNl === -1 ? trimmed : trimmed.slice(0, firstNl);
	const afterFirst = firstNl === -1 ? '' : trimmed.slice(firstNl + 1);
	if (afterFirst.trim().length > 0) {
		return null;
	}
	const m = /^\/([a-zA-Z][a-zA-Z0-9_-]*)(?:\s+(.*))?$/.exec(head.trim());
	if (!m) {
		return null;
	}
	return { command: m[1].toLowerCase(), args: (m[2] || '').trim() };
}
