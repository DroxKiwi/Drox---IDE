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
import { DROX_BASH_USER_STOPPED } from '../common/droxBash.js';
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
			takeUserStop: async () => {
				try {
					const r = await droxEngineService.request('tools.takeBashSkip', {}) as { stop?: boolean };
					return r?.stop === true;
				} catch (e) {
					this.logService.info(
						`[Drox] tools.takeBashSkip: ${e instanceof Error ? e.message : String(e)}`,
					);
					return false;
				}
			},
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
				const command = extractBashCommand(p.input);
				const skipped: IDroxToolExecResult = {
					output: {
						error: DROX_BASH_USER_STOPPED,
						skipped: true,
						command,
					},
					isError: true,
				};
				// Return the tool result before any kill. A hung IPC must not
				// keep the model waiting, and the sentence stays out of the card.
				settled = true;
				resolveSkip?.({ result: skipped });
				const terminalService = this.terminalService;
				const engineChannel = this.engineChannel;
				const logService = this.logService;
				void (async () => {
					const ide = skipActiveDroxBashInIdeTerminal();
					const forced = ide ? false : forceInterruptDroxAgentTerminal(terminalService);
					let exec = false;
					try {
						exec = await engineChannel.call<boolean>(DroxEngineCommand.SkipExecBash);
					} catch (e) {
						logService.info(
							`[Drox] SkipExecBash: ${e instanceof Error ? e.message : String(e)}`,
						);
					}
					void skipRegisteredDroxBash();
					logService.info(
						`[Drox] tool/exec bash skip: waiter released (ide=${ide} forced=${forced} exec=${exec})`,
					);
				})();
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
		// Never return before `tools.skipBash`: a live agent run is not a stop.
		// The engine must complete the in-flight `tool/exec` or the card stays
		// Running and the model is not called again.
		let fromWrap = false;
		if (this._bashToolExecSkip) {
			fromWrap = await this._bashToolExecSkip();
		}
		const gated = await skipRegisteredDroxBash();
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
		let engineSkipped = false;
		let nativeChild = false;
		try {
			const r = await this.droxEngineService.request('tools.skipBash', {}) as { skipped?: boolean; native?: boolean };
			engineSkipped = r?.skipped === true;
			nativeChild = r?.native === true;
		} catch (e) {
			this.logService.info(
				`[Drox] skipActiveBash tools.skipBash: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
		// A native child keeps the flag: its wait consumes it and reports the stop.
		// A client bash already got the stop sentence — do not also skip the next one.
		if ((fromWrap || gated || ide || exec) && !nativeChild) {
			try {
				await this.droxEngineService.request('tools.clearBashSkip', {});
			} catch (e) {
				this.logService.info(
					`[Drox] tools.clearBashSkip: ${e instanceof Error ? e.message : String(e)}`,
				);
			}
		}
		const runActive = this.droxEngineService.isAgentRunActive;
		const ok = fromWrap || gated || ide || forced || exec || engineSkipped;
		this.logService.info(
			`[Drox] skipActiveBash result=${ok} wrap=${fromWrap} gated=${gated} ide=${ide} forced=${forced} exec=${exec} engine=${engineSkipped} native=${nativeChild} run=${runActive}`,
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
