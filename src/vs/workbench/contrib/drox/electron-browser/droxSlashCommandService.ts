/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { applyDroxConfigurationUpdate, readDroxArchitectModelForContext } from '../common/droxAgentsConfiguration.js';
import { DroxSetting } from '../common/droxConfiguration.js';
import { IDroxLongMemoryService } from '../common/droxLongMemoryService.js';
import { IDroxSessionCompactService } from '../common/droxSessionCompactService.js';
import { formatSessionCompactChatMessage } from '../common/droxSessionCompact.js';
import {
	IDroxSlashCommandContext,
	IDroxSlashCommandService,
} from '../common/droxSlashCommandService.js';

export class DroxSlashCommandService implements IDroxSlashCommandService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IDroxSessionCompactService private readonly sessionCompactService: IDroxSessionCompactService,
		@IDroxLongMemoryService private readonly longMemoryService: IDroxLongMemoryService,
		@IProgressService private readonly progressService: IProgressService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IEditorService private readonly editorService: IEditorService,
	) { }

	async handleSlash(ctx: IDroxSlashCommandContext, command: string, args: string): Promise<void> {
		if (!command) {
			return;
		}

		const folders = this.workspaceContextService.getWorkspace().folders;
		const wsFolder = folders[0];
		if (!wsFolder) {
			ctx.post({
				kind: 'append',
				role: 'error',
				text: localize('drox.slash.noWorkspace', 'Open a workspace folder before using / commands.'),
			});
			return;
		}

		const wsUri = wsFolder.uri;
		switch (command) {
			case 'help':
			case '?':
				ctx.post({
					kind: 'append',
					role: 'system',
					text:
						'Available **/** commands:\n\n' +
						'- `/help` — this help\n' +
						'- `/clear` or `/new` — new conversation (UI reset)\n' +
						'- **☰** or **+** icon — session history / new conversation\n' +
						'- `/model [id]` — show or set `drox.architect.model`\n' +
						'- `/init` — create `.drox`, `MEMORY.md`, `DROX.md` if missing\n' +
						'- `/memory` — open `MEMORY.md`\n' +
						'- `/compact` — LLM transcript compaction (`session.compact`; `session_compact` tool)\n' +
						'- `/session_end` or `/end-session` — compaction, long-memory archive (`.drox/long-memory/`), new thread\n' +
						'- **`session_search`** tool — search long memory\n',
				});
				return;

			case 'clear':
			case 'new':
				ctx.startNewChat();
				ctx.post({
					kind: 'append',
					role: 'system',
					text: localize('drox.slash.newChat', 'New conversation — local session reset.'),
				});
				return;

			case 'model': {
				if (args.length > 0) {
					await applyDroxConfigurationUpdate(this.configurationService, DroxSetting.ArchitectModel, args, wsUri);
					ctx.post({
						kind: 'append',
						role: 'system',
						text: localize('drox.slash.modelSet', 'Model set to `{0}`.', args),
					});
				} else {
					const cur = readDroxArchitectModelForContext(this.configurationService, wsUri);
					ctx.post({
						kind: 'append',
						role: 'system',
						text: cur
							? localize('drox.slash.modelCurrent', 'Current model: `{0}`. Use `/model <name>` to change.', cur)
							: localize('drox.slash.modelUnset', 'No `drox.architect.model` configured — defaults / `.drox/env`.'),
					});
				}
				return;
			}

			case 'init':
				await this.scaffoldDroxMemdir(ctx, wsUri);
				return;

			case 'memory': {
				const memoryUri = URI.joinPath(wsUri, 'MEMORY.md');
				if (!(await this.fileService.exists(memoryUri))) {
					await this.fileService.writeFile(
						memoryUri,
						VSBuffer.fromString(
							'# Project memory (Drox)\n\nDescribe stable goals, conventions, and decisions here.\n',
						),
					);
				}
				await this.editorService.openEditor({ resource: memoryUri, options: { pinned: false } });
				ctx.post({
					kind: 'append',
					role: 'system',
					text: localize('drox.slash.memoryOpened', 'Opened `MEMORY.md`.'),
				});
				return;
			}

			case 'compact': {
				if (ctx.getCurrentRunId()) {
					ctx.post({
						kind: 'append',
						role: 'error',
						text: localize(
							'drox.slash.compactBusy',
							'A run is in progress — stop it, then run `/compact`.',
						),
					});
					return;
				}
				const sessionId = ctx.getCurrentSessionId();
				if (!sessionId) {
					ctx.post({
						kind: 'append',
						role: 'system',
						text: localize(
							'drox.slash.compactNoSession',
							'No session id — send at least one message, then run `/compact` when a transcript exists.',
						),
					});
					return;
				}
				try {
					const res = await this.sessionCompactService.compactSession(wsUri, sessionId, {
						onActiveChange: active => ctx.post({ kind: 'compact', active }),
					});
					await this.longMemoryService.ingestFromSessionCompact(wsUri, sessionId, res);
					ctx.post({ kind: 'append', role: 'system', text: formatSessionCompactChatMessage(res) });
				} catch (e) {
					ctx.post({
						kind: 'append',
						role: 'error',
						text: e instanceof Error ? e.message : String(e),
					});
				}
				return;
			}

			case 'session_end':
			case 'end-session': {
				if (ctx.getCurrentRunId()) {
					ctx.post({
						kind: 'append',
						role: 'error',
						text: localize(
							'drox.slash.sessionEndBusy',
							'A run is in progress — use Stop, wait for completion, then run `/session_end`.',
						),
					});
					return;
				}
				const sessionId = ctx.getCurrentSessionId();
				if (!sessionId) {
					ctx.post({
						kind: 'append',
						role: 'system',
						text: localize(
							'drox.slash.sessionEndNoSession',
							'No session id — send at least one message in this thread, then `/session_end`.',
						),
					});
					return;
				}
				const farewellHint = args.length > 0 ? args : undefined;
				try {
					await this.progressService.withProgress(
						{
							location: ProgressLocation.Window,
							title: localize('drox.sessionEnd.progressTitle', 'Drox — session closure'),
						},
						async () => {
							try {
								const res = await this.sessionCompactService.compactSession(wsUri, sessionId, {
									onActiveChange: active => ctx.post({ kind: 'compact', active }),
								});
								await this.longMemoryService.ingestFromSessionCompact(wsUri, sessionId, res);
							} catch {
								// pre-compact optional
							}
							const { closureId, chunkCount } = await this.longMemoryService.closeSession(
								wsUri,
								sessionId,
								farewellHint,
							);
							ctx.startNewChat();
							ctx.post({
								kind: 'append',
								role: 'system',
								text: localize(
									'drox.slash.sessionEndDone',
									'**Session closed** (long memory). Closure `{0}` — {1} segment(s) archived. New thread on next message.',
									closureId,
									String(chunkCount),
								),
							});
						},
					);
				} catch (e) {
					ctx.post({
						kind: 'append',
						role: 'error',
						text: e instanceof Error ? e.message : String(e),
					});
				}
				return;
			}

			default:
				ctx.post({
					kind: 'append',
					role: 'system',
					text: localize('drox.slash.unknown', 'Unknown command: `/{0}`. Type `/help`.', command),
				});
		}
	}

	private async scaffoldDroxMemdir(ctx: IDroxSlashCommandContext, wsUri: URI): Promise<void> {
		const droxDir = URI.joinPath(wsUri, '.drox');
		try {
			await this.fileService.createFolder(droxDir);
		} catch {
			/* exists */
		}

		const memoryUri = URI.joinPath(wsUri, 'MEMORY.md');
		if (!(await this.fileService.exists(memoryUri))) {
			await this.fileService.writeFile(
				memoryUri,
				VSBuffer.fromString('# Project memory\n\n## Goals\n\n## Decisions\n\n## Notes\n\n'),
			);
		}

		const droxMd = URI.joinPath(wsUri, 'DROX.md');
		if (!(await this.fileService.exists(droxMd))) {
			await this.fileService.writeFile(
				droxMd,
				VSBuffer.fromString('# Drox instructions\n\nRepo-specific rules for the agent.\n\n'),
			);
		}

		ctx.post({
			kind: 'append',
			role: 'system',
			text: localize(
				'drox.slash.initDone',
				'Initialized: `.drox` folder and `MEMORY.md` / `DROX.md` verified or created.',
			),
		});
	}
}
