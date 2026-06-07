/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IDroxEngineService } from '../common/droxEngineService.js';
import {
	IDroxSessionListEntry,
	IDroxSessionReadResult,
	IDroxSessionUiStats,
	IDroxTranscriptMessage,
} from '../common/droxSession.js';
import { IDroxSessionService, IDroxUiReplayTailResult, IDroxWorkspaceResetResult } from '../common/droxSessionService.js';
import { sliceUiReplayBeforeTurns, sliceUiReplayTailTurns } from '../common/droxUiReplayTail.js';
import { droxWorkspaceSessionsDir } from '../common/droxWorkspacePaths.js';
import {
	droxSessionUiReplayPath,
	parseDroxUiReplayLine,
	shouldRecordDroxUiReplayMessage,
} from '../common/droxUiReplayJournal.js';
import { DroxHostToWebviewMessage } from '../browser/droxChatBridge.js';

export class DroxSessionService implements IDroxSessionService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IDroxEngineService private readonly droxEngineService: IDroxEngineService,
		@IFileService private readonly fileService: IFileService,
	) { }

	private sessionRpcParams(workspaceFsPath: string): Record<string, unknown> {
		return {
			workspace: workspaceFsPath,
			dir: droxWorkspaceSessionsDir(workspaceFsPath),
		};
	}

	async listSessions(workspaceFsPath: string): Promise<IDroxSessionListEntry[]> {
		await this.droxEngineService.initialize();
		const res = await this.droxEngineService.request('session.list', this.sessionRpcParams(workspaceFsPath));
		const entries = Array.isArray(res) ? res : [];
		return entries.map(e => {
			const row = e as {
				id?: string;
				modifiedSecs?: number;
				modified_secs?: number;
				sizeBytes?: number;
				size_bytes?: number;
				title?: string;
			};
			const title = typeof row.title === 'string' ? row.title.trim() : '';
			return {
				id: typeof row.id === 'string' ? row.id : '',
				modifiedSecs: Number(row.modifiedSecs ?? row.modified_secs ?? 0),
				sizeBytes: Number(row.sizeBytes ?? row.size_bytes ?? 0),
				title: title.length > 0 ? title : undefined,
			};
		}).filter(e => e.id.startsWith('ses_'));
	}

	async readSession(id: string, workspaceFsPath: string): Promise<IDroxSessionReadResult> {
		await this.droxEngineService.initialize();
		const res = await this.droxEngineService.request('session.read', {
			id,
			...this.sessionRpcParams(workspaceFsPath),
		}) as {
			messages?: unknown[];
			uiStats?: { totalIn?: number; totalOut?: number; ctx?: number };
		};
		const messages = (Array.isArray(res?.messages) ? res.messages : []).map(m => this.parseMessage(m));
		let uiStats: IDroxSessionUiStats | undefined;
		if (res?.uiStats && typeof res.uiStats === 'object') {
			uiStats = {
				totalIn: Number(res.uiStats.totalIn ?? 0),
				totalOut: Number(res.uiStats.totalOut ?? 0),
				ctx: Number(res.uiStats.ctx ?? 0),
			};
		}
		return { messages, uiStats };
	}

	async readUiReplay(id: string, workspaceFsPath: string): Promise<DroxHostToWebviewMessage[]> {
		const tail = await this.readUiReplayTail(id, workspaceFsPath, { maxTurns: Number.MAX_SAFE_INTEGER });
		return tail.messages;
	}

	private async readUiReplayParsed(id: string, workspaceFsPath: string): Promise<DroxHostToWebviewMessage[]> {
		if (!id.startsWith('ses_')) {
			return [];
		}
		const uri = URI.file(droxSessionUiReplayPath(workspaceFsPath, id));
		try {
			const file = await this.fileService.readFile(uri);
			const raw = file.value.toString();
			const out: DroxHostToWebviewMessage[] = [];
			for (const line of raw.split('\n')) {
				const msg = parseDroxUiReplayLine(line);
				if (msg) {
					out.push(msg as DroxHostToWebviewMessage);
				}
			}
			return out;
		} catch {
			return [];
		}
	}

	async readUiReplayTail(
		id: string,
		workspaceFsPath: string,
		opts: { readonly maxTurns: number },
	): Promise<IDroxUiReplayTailResult> {
		const out = await this.readUiReplayParsed(id, workspaceFsPath);
		const { slice, hasOlder, oldestLoadedIndex } = sliceUiReplayTailTurns(out, opts.maxTurns);
		return {
			messages: slice,
			hasOlder,
			totalEventCount: out.length,
			oldestLoadedIndex,
		};
	}

	async readUiReplayOlder(
		id: string,
		workspaceFsPath: string,
		opts: { readonly beforeIndex: number; readonly maxTurns: number },
	): Promise<IDroxUiReplayTailResult> {
		const out = await this.readUiReplayParsed(id, workspaceFsPath);
		if (out.length === 0) {
			return { messages: [], hasOlder: false, totalEventCount: 0, oldestLoadedIndex: 0 };
		}
		const { slice, hasOlder, oldestLoadedIndex } = sliceUiReplayBeforeTurns(
			out,
			opts.beforeIndex,
			opts.maxTurns,
		);
		return {
			messages: slice,
			hasOlder,
			totalEventCount: out.length,
			oldestLoadedIndex,
		};
	}

	async appendUiReplayMessage(
		id: string,
		workspaceFsPath: string,
		message: DroxHostToWebviewMessage,
	): Promise<void> {
		if (!id.startsWith('ses_') || !shouldRecordDroxUiReplayMessage(message)) {
			return;
		}
		try {
			const uri = URI.file(droxSessionUiReplayPath(workspaceFsPath, id));
			const line = `${JSON.stringify(message)}\n`;
			await this.fileService.writeFile(uri, VSBuffer.fromString(line), { append: true });
		} catch {
			/* best-effort */
		}
	}

	async resetWorkspace(workspaceFsPath: string): Promise<IDroxWorkspaceResetResult> {
		await this.droxEngineService.initialize();
		const res = await this.droxEngineService.request('workspace.reset', {
			workspace: workspaceFsPath,
		}) as Record<string, unknown>;
		return {
			sessionsFilesRemoved: Number(res.sessionsFilesRemoved ?? res.sessions_files_removed ?? 0),
			workspaceMapRemoved: Boolean(res.workspaceMapRemoved ?? res.workspace_map_removed),
			longMemoryCleared: Boolean(res.longMemoryCleared ?? res.long_memory_cleared),
			memorySessionsFilesRemoved: Number(res.memorySessionsFilesRemoved ?? res.memory_sessions_files_removed ?? 0),
			attachmentsCleared: Boolean(res.attachmentsCleared ?? res.attachments_cleared),
			courseCyclesCleared: Boolean(res.courseCyclesCleared ?? res.course_cycles_cleared),
			agentOutputCleared: Boolean(res.agentOutputCleared ?? res.agent_output_cleared),
		};
	}

	private parseMessage(raw: unknown): IDroxTranscriptMessage {
		const m = raw as { role?: string; content?: unknown[] };
		const role = m.role === 'user' || m.role === 'assistant' || m.role === 'tool' || m.role === 'system'
			? m.role
			: 'system';
		const content = Array.isArray(m.content)
			? m.content.map(c => {
				const b = c as Record<string, unknown>;
				const content =
					typeof b.content === 'string'
						? b.content
						: b.content !== undefined && b.content !== null
							? JSON.stringify(b.content)
							: undefined;
				return {
					type: typeof b.type === 'string' ? b.type : 'text',
					text: typeof b.text === 'string' ? b.text : undefined,
					name: typeof b.name === 'string' ? b.name : undefined,
					content,
					is_error: Boolean(b.is_error ?? b.isError),
					id: typeof b.id === 'string' ? b.id : undefined,
					input: 'input' in b ? b.input : undefined,
					tool_use_id:
						typeof b.tool_use_id === 'string'
							? b.tool_use_id
							: typeof b.toolUseId === 'string'
								? b.toolUseId
								: undefined,
				};
			})
			: [];
		return { role, content };
	}
}
