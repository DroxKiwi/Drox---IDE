/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import type { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IMarkerService } from '../../../../platform/markers/common/markers.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IOutputService } from '../../../services/output/common/output.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { ITerminalService } from '../../terminal/browser/terminal.js';
import {
	DroxClientToolRegistry,
	IDroxToolExecParams,
	IDroxToolExecResult,
} from '../common/droxClientTools.js';
import { IDroxClientToolsService } from '../common/droxClientToolsService.js';
import { DROX_ENGINE_CHANNEL_NAME, DroxEngineCommand } from '../common/droxIpc.js';
import { IDroxEngineService } from '../common/droxEngineService.js';
import { RpcRequestHandler, RpcRequestResult } from '../common/droxRpc.js';
import { IDroxChatSessionService } from '../common/droxChatSessionService.js';
import { IDroxLongMemoryService } from '../common/droxLongMemoryService.js';
import { IDroxSessionCompactService } from '../common/droxSessionCompactService.js';
import { IDroxCodebaseIndexService } from '../common/codebase/droxCodebaseIndexService.js';
import { createDroxBashToolHandler } from './tools/droxBashTool.js';
import { skipRegisteredDroxBash } from './tools/droxActiveBashGate.js';
import {
	forceInterruptDroxAgentTerminal,
	skipActiveDroxBashInIdeTerminal,
} from './tools/droxIdeBashTerminal/index.js';
import { createDroxFileEditToolHandler } from './tools/droxFileEditTool.js';
import { DroxFileToolHost } from './tools/droxFileToolHost.js';
import { createDroxFileWriteToolHandler } from './tools/droxFileWriteTool.js';
import { createDroxSessionCompactToolHandler } from './tools/droxSessionCompactTool.js';
import { createDroxSessionEndToolHandler } from './tools/droxSessionEndTool.js';
import { createDroxSessionSearchToolHandler } from './tools/droxSessionSearchTool.js';
import { createDroxCodebaseSearchToolHandler } from './tools/droxCodebaseSearchTool.js';
import { createDroxLspToolHandler } from './tools/droxLspTool.js';
import { createDroxNotebookEditToolHandler } from './tools/droxNotebookEditTool.js';

export class DroxClientToolsService extends Disposable implements IDroxClientToolsService {

	declare readonly _serviceBrand: undefined;

	private readonly registry = new DroxClientToolRegistry();

	readonly executableToolNames: readonly string[];

	private readonly engineChannel: IChannel;
	private readonly droxEngineService: IDroxEngineService;
	private readonly terminalService: ITerminalService;

	/**
	 * Instance latch for in-flight `tool/exec` bash — Skip uses this (not a module
	 * singleton) so the same service that runs the waiter also clears it.
	 */
	private _bashToolExecSkip: (() => Promise<boolean>) | undefined;

	constructor(
		@IDroxEngineService droxEngineService: IDroxEngineService,
		@IMainProcessService mainProcessService: IMainProcessService,
		@IFileService fileService: IFileService,
		@IOutputService outputService: IOutputService,
		@ITerminalService terminalService: ITerminalService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IDroxChatSessionService chatSessionService: IDroxChatSessionService,
		@IDroxSessionCompactService sessionCompactService: IDroxSessionCompactService,
		@IDroxLongMemoryService longMemoryService: IDroxLongMemoryService,
		@IDroxCodebaseIndexService codebaseIndexService: IDroxCodebaseIndexService,
		@ICommandService commandService: ICommandService,
		@IMarkerService markerService: IMarkerService,
		@ITextModelService textModelService: ITextModelService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.droxEngineService = droxEngineService;
		this.terminalService = terminalService;
		this.engineChannel = mainProcessService.getChannel(DROX_ENGINE_CHANNEL_NAME);

		const fileHost = instantiationService.createInstance(DroxFileToolHost);

		this.registry.register('bash', createDroxBashToolHandler(mainProcessService, outputService, terminalService, {
			isSessionsWindow: environmentService.isSessionsWindow,
		}));
		this.registry.register('file_write', createDroxFileWriteToolHandler(fileHost, fileService));
		this.registry.register('file_edit', createDroxFileEditToolHandler(fileHost, fileService));
		this.registry.register('notebook_edit', createDroxNotebookEditToolHandler(fileHost, fileService));

		this.registry.register(
			'session_compact',
			createDroxSessionCompactToolHandler(chatSessionService, sessionCompactService, longMemoryService),
		);

		this.registry.register(
			'session_end',
			createDroxSessionEndToolHandler(chatSessionService, longMemoryService),
		);

		this.registry.register(
			'session_search',
			createDroxSessionSearchToolHandler(longMemoryService),
		);

		this.registry.register(
			'codebase_search',
			createDroxCodebaseSearchToolHandler(codebaseIndexService),
		);

		this.registry.register(
			'lsp',
			createDroxLspToolHandler(commandService, markerService, textModelService),
		);

		this.executableToolNames = this.registry.executableToolNames();

		const inner = this.registry.toRequestHandler(() => chatSessionService.getRunId());
		droxEngineService.setRequestHandler('tool/exec', this.wrapToolExecWithBashSkip(inner));
	}

	private wrapToolExecWithBashSkip(inner: RpcRequestHandler): RpcRequestHandler {
		return async (rawParams) => {
			const p = rawParams as IDroxToolExecParams | undefined;
			if (!p || p.toolName !== 'bash') {
				return inner(rawParams);
			}

			let settled = false;
			let resolveSkip: ((result: RpcRequestResult) => void) | undefined;
			const skipPromise = new Promise<RpcRequestResult>(resolve => {
				resolveSkip = resolve;
			});

			this._bashToolExecSkip = async () => {
				if (settled) {
					// Race already completed — still try hard kill, but do not
					// resolve skipPromise again (caller will fall through).
					return false;
				}
				const ide = skipActiveDroxBashInIdeTerminal();
				const forced = ide ? false : forceInterruptDroxAgentTerminal(this.terminalService);
				let exec = false;
				try {
					exec = await this.engineChannel.call<boolean>(DroxEngineCommand.SkipExecBash);
				} catch (e) {
					this.logService.info(
						`[Drox] SkipExecBash: ${e instanceof Error ? e.message : String(e)}`,
					);
				}
				// Also clear the bash-tool module latch if present.
				void skipRegisteredDroxBash();

				const command = extractBashCommand(p.input);
				const skipped: IDroxToolExecResult = {
					output: {
						error: 'Skipped by user',
						skipped: true,
						command,
					},
					isError: true,
				};
				settled = true;
				resolveSkip?.({ result: skipped });
				this.logService.info(
					`[Drox] tool/exec bash skip: resolving waiter (ide=${ide} forced=${forced} exec=${exec})`,
				);
				return true;
			};

			try {
				const result = await Promise.race([inner(rawParams), skipPromise]);
				settled = true;
				return result;
			} finally {
				settled = true;
				this._bashToolExecSkip = undefined;
			}
		};
	}

	async skipActiveBash(): Promise<boolean> {
		// 1) In-flight tool/exec latch (may return false if already settled — fall through).
		if (this._bashToolExecSkip) {
			const fromWrap = await this._bashToolExecSkip();
			if (fromWrap) {
				return true;
			}
		}
		// 2) Bash-tool module latch (same renderer).
		const gated = await skipRegisteredDroxBash();
		if (gated) {
			return true;
		}
		// 3) IDE shared terminal latch + hard recycle / find-by-name.
		const ide = skipActiveDroxBashInIdeTerminal();
		const forced = ide ? false : forceInterruptDroxAgentTerminal(this.terminalService);
		let exec = false;
		try {
			exec = await this.engineChannel.call<boolean>(DroxEngineCommand.SkipExecBash);
		} catch (e) {
			this.logService.info(
				`[Drox] skipActiveBash ExecBash: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
		let native = false;
		try {
			const r = await this.droxEngineService.request('tools.skipBash', {}) as { skipped?: boolean };
			native = r?.skipped === true;
		} catch (e) {
			this.logService.info(
				`[Drox] skipActiveBash tools.skipBash: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
		const ok = ide || forced || exec || native;
		this.logService.info(
			`[Drox] skipActiveBash result=${ok} ide=${ide} forced=${forced} exec=${exec} native=${native}`,
		);
		return ok;
	}
}

function extractBashCommand(input: unknown): string {
	if (input && typeof input === 'object' && typeof (input as { command?: unknown }).command === 'string') {
		return (input as { command: string }).command;
	}
	return '';
}
