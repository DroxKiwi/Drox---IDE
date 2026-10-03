/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import {
	DROX_REGULATION_DEFAULT_MODULES,
	DROX_REGULATION_LEVER_IDS,
	DroxRegulationLeverId,
	DroxRegulationModulesByLever,
	DroxRegulationRunIssue,
	IDroxRegulationHistoryEntry,
} from './droxRegulationTypes.js';
import { droxRegulationDir, droxRegulationHistoryPath } from './droxRegulationPaths.js';

export const DROX_REGULATION_HISTORY_SCHEMA = 1;
export const DROX_REGULATION_HISTORY_MAX_ENTRIES = 200;

export interface IDroxRegulationHistoryFile {
	readonly schema: number;
	readonly entries: readonly IDroxRegulationHistoryEntry[];
}

const ISSUES: readonly DroxRegulationRunIssue[] = ['ok', 'error', 'cancel', 'loop'];

function isIssue(v: unknown): v is DroxRegulationRunIssue {
	return typeof v === 'string' && (ISSUES as readonly string[]).includes(v);
}

function parseModules(raw: unknown): DroxRegulationModulesByLever {
	const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
	return {
		L1: (typeof o.L1 === 'string' ? o.L1 : DROX_REGULATION_DEFAULT_MODULES.L1) as DroxRegulationModulesByLever['L1'],
		L2: (typeof o.L2 === 'string' ? o.L2 : DROX_REGULATION_DEFAULT_MODULES.L2) as DroxRegulationModulesByLever['L2'],
		L3: (typeof o.L3 === 'string' ? o.L3 : DROX_REGULATION_DEFAULT_MODULES.L3) as DroxRegulationModulesByLever['L3'],
		L4: (typeof o.L4 === 'string' ? o.L4 : DROX_REGULATION_DEFAULT_MODULES.L4) as DroxRegulationModulesByLever['L4'],
		L5: (typeof o.L5 === 'string' ? o.L5 : DROX_REGULATION_DEFAULT_MODULES.L5) as DroxRegulationModulesByLever['L5'],
	};
}

function parseLeverScores(raw: unknown): Readonly<Record<DroxRegulationLeverId, number>> {
	const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
	const out = {} as Record<DroxRegulationLeverId, number>;
	for (const lever of DROX_REGULATION_LEVER_IDS) {
		const n = Number(o[lever]);
		out[lever] = Number.isFinite(n) ? n : 50;
	}
	return out;
}

export function parseDroxRegulationHistoryEntry(raw: unknown): IDroxRegulationHistoryEntry | undefined {
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	const row = raw as Record<string, unknown>;
	if (typeof row.id !== 'string' || !row.id) {
		return undefined;
	}
	const at = Number(row.at);
	if (!Number.isFinite(at)) {
		return undefined;
	}
	if (typeof row.modelKey !== 'string' || !row.modelKey) {
		return undefined;
	}
	if (!isIssue(row.issue)) {
		return undefined;
	}
	return {
		id: row.id,
		at,
		sessionId: typeof row.sessionId === 'string' ? row.sessionId : undefined,
		runId: typeof row.runId === 'string' ? row.runId : undefined,
		promptExcerpt: typeof row.promptExcerpt === 'string' ? row.promptExcerpt : '',
		modelKey: row.modelKey,
		workspaceRootFsPath: typeof row.workspaceRootFsPath === 'string' ? row.workspaceRootFsPath : undefined,
		modules: parseModules(row.modules),
		leverScores: parseLeverScores(row.leverScores),
		globalScore: Number.isFinite(Number(row.globalScore)) ? Number(row.globalScore) : 50,
		issue: row.issue,
		issueDetail: typeof row.issueDetail === 'string' ? row.issueDetail : undefined,
	};
}

export function parseDroxRegulationHistoryFile(raw: string): IDroxRegulationHistoryFile {
	try {
		const parsed = JSON.parse(raw) as { schema?: unknown; entries?: unknown };
		const entries = Array.isArray(parsed.entries)
			? parsed.entries.map(parseDroxRegulationHistoryEntry).filter((e): e is IDroxRegulationHistoryEntry => Boolean(e))
			: [];
		return { schema: DROX_REGULATION_HISTORY_SCHEMA, entries };
	} catch {
		return { schema: DROX_REGULATION_HISTORY_SCHEMA, entries: [] };
	}
}

export function serializeDroxRegulationHistoryFile(entries: readonly IDroxRegulationHistoryEntry[]): string {
	const trimmed = entries.length > DROX_REGULATION_HISTORY_MAX_ENTRIES
		? entries.slice(entries.length - DROX_REGULATION_HISTORY_MAX_ENTRIES)
		: entries;
	const file: IDroxRegulationHistoryFile = {
		schema: DROX_REGULATION_HISTORY_SCHEMA,
		entries: trimmed,
	};
	return `${JSON.stringify(file, null, '\t')}\n`;
}

export async function droxRegulationReadHistory(
	fileService: IFileService,
	workspaceRootFsPath: string,
): Promise<readonly IDroxRegulationHistoryEntry[]> {
	const uri = URI.file(droxRegulationHistoryPath(workspaceRootFsPath));
	if (!(await fileService.exists(uri))) {
		return [];
	}
	try {
		const raw = (await fileService.readFile(uri)).value.toString();
		return parseDroxRegulationHistoryFile(raw).entries;
	} catch {
		return [];
	}
}

export async function droxRegulationWriteHistory(
	fileService: IFileService,
	workspaceRootFsPath: string,
	entries: readonly IDroxRegulationHistoryEntry[],
): Promise<void> {
	const dir = URI.file(droxRegulationDir(workspaceRootFsPath));
	await fileService.createFolder(dir);
	const uri = URI.file(droxRegulationHistoryPath(workspaceRootFsPath));
	await fileService.writeFile(uri, VSBuffer.fromString(serializeDroxRegulationHistoryFile(entries)));
}

export function droxRegulationPromptExcerptFromMessages(
	messages: readonly { readonly role: string; readonly content: readonly { readonly type: string; readonly text?: string }[] }[] | undefined,
	max = 160,
): string {
	if (!messages?.length) {
		return '';
	}
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (m.role !== 'user') {
			continue;
		}
		const text = m.content
			.filter(c => c.type === 'text' && typeof c.text === 'string')
			.map(c => c.text!.trim())
			.filter(Boolean)
			.join(' ')
			.replace(/\s+/g, ' ')
			.trim();
		if (text.length >= 1) {
			return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
		}
	}
	return '';
}
