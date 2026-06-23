/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';

import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';

import { IOutputService } from '../../../services/output/common/output.js';

import { DroxClientToolRegistry } from '../common/droxClientTools.js';

import { IDroxClientToolsService } from '../common/droxClientToolsService.js';

import { IDroxEngineService } from '../common/droxEngineService.js';

import { createDroxBashToolHandler } from './tools/droxBashTool.js';

import { createDroxFileEditToolHandler } from './tools/droxFileEditTool.js';

import { DroxFileToolHost } from './tools/droxFileToolHost.js';

import { createDroxFileWriteToolHandler } from './tools/droxFileWriteTool.js';
import { createDroxSessionCompactToolHandler } from './tools/droxSessionCompactTool.js';
import { createDroxSessionEndToolHandler } from './tools/droxSessionEndTool.js';
import { createDroxSessionSearchToolHandler } from './tools/droxSessionSearchTool.js';
import { createDroxLspToolHandler } from './tools/droxLspTool.js';
import { createDroxNotebookEditToolHandler } from './tools/droxNotebookEditTool.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IMarkerService } from '../../../../platform/markers/common/markers.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IDroxChatSessionService } from '../common/droxChatSessionService.js';
import { IDroxLongMemoryService } from '../common/droxLongMemoryService.js';
import { IDroxSessionCompactService } from '../common/droxSessionCompactService.js';

export class DroxClientToolsService extends Disposable implements IDroxClientToolsService {

	declare readonly _serviceBrand: undefined;

	private readonly registry = new DroxClientToolRegistry();

	readonly executableToolNames: readonly string[];

	constructor(
		@IDroxEngineService droxEngineService: IDroxEngineService,
		@IMainProcessService mainProcessService: IMainProcessService,
		@IFileService fileService: IFileService,
		@IOutputService outputService: IOutputService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IDroxChatSessionService chatSessionService: IDroxChatSessionService,
		@IDroxSessionCompactService sessionCompactService: IDroxSessionCompactService,
		@IDroxLongMemoryService longMemoryService: IDroxLongMemoryService,
		@ICommandService commandService: ICommandService,
		@IMarkerService markerService: IMarkerService,
		@ITextModelService textModelService: ITextModelService,
	) {
		super();

		const fileHost = instantiationService.createInstance(DroxFileToolHost);

		this.registry.register('bash', createDroxBashToolHandler(mainProcessService, outputService));
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
			'lsp',
			createDroxLspToolHandler(commandService, markerService, textModelService),
		);

		this.executableToolNames = this.registry.executableToolNames();

		droxEngineService.setRequestHandler('tool/exec', this.registry.toRequestHandler(() => chatSessionService.getRunId()));
	}
}
