/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../../nls.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { DroxCommands } from '../../common/drox.js';
import { DroxSetting } from '../../common/droxConfiguration.js';
import { normalizeDroxArchitectInteractionMode } from '../../common/droxArchitectInteractionMode.js';
import { normalizeDroxPermissionMode } from '../../common/droxPermissionAsk.js';
import { IDroxAttachmentPayload } from '../../common/droxAttachments.js';
import { IDroxAttachmentsService } from '../../common/droxAttachmentsService.js';
import { IDroxClientToolsService } from '../../common/droxClientToolsService.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { DroxSlashHostMessage, IDroxSlashCommandService } from '../../common/droxSlashCommandService.js';
import { IDroxUserAskService } from '../../common/droxUserAskService.js';
import { DroxWebviewToHostMessage } from '../droxChatBridge.js';
import { DroxChatDragAndDrop } from '../droxChatDragAndDrop.js';
import { refreshDroxChatLlmModels } from './droxChatLlmModels.js';
import {
	setDroxArchitectLlmParamsFromWebview,
	setDroxArchitectModelFromWebview,
	setDroxExecutorLlmParamsFromWebview,
	setDroxExecutorModelFromWebview,
	setDroxOrchestrationMaxParallelExecutorsFromWebview,
} from './droxChatRoleModels.js';
import { IDroxGeneralSettingsPatch, pushGeneralSettingsToWebview, setDroxGeneralSettingsFromWebview } from './droxChatGeneralSettings.js';
import { IDroxLlmModelsService } from '../../common/droxLlmModelsService.js';
import { IDroxRunRevertService } from '../../common/droxRunRevertService.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { handleDroxRevertLastRun, handleDroxRevertToMessage } from './droxChatRunRevert.js';
import { handleDroxExportTranscript } from './droxChatTranscriptExport.js';
import { cancelDroxChatRun, executeDroxChatSend, IDroxChatSendRunHost } from './droxChatSendRun.js';
import { DroxChatTabsManager } from './droxChatTabsManager.js';
import { confirmAndResetWorkspaceDroxData } from './droxChatWorkspaceReset.js';
import {
	handleDroxPathComplete,
	IDroxChatFileActionsHost,
	openDroxPasteSource,
	openDroxWorkspaceFile,
} from './droxChatFileActions.js';

export interface IDroxChatWebviewRouterHost extends IDroxChatSendRunHost, IDroxChatFileActionsHost {
	syncWebviewAfterAttach(): void;
	syncRunRevertState(): void;
	getChatDragDrop(): DroxChatDragAndDrop | undefined;
	getPeekedDropUris(): readonly string[];
	setPeekedDropUris(uris: readonly string[]): void;
	applyDropResult(result: { readonly uris: readonly string[]; readonly attachments: readonly IDroxAttachmentPayload[] }): void;
	getCurrentRunId(): string | undefined;
}

export interface IDroxChatWebviewRouterDeps {
	readonly userAskService: IDroxUserAskService;
	readonly dialogService: IDialogService;
	readonly notificationService: INotificationService;
	readonly attachmentsService: IDroxAttachmentsService;
	readonly fileService: IFileService;
	readonly clientToolsService: IDroxClientToolsService;
	readonly runSettingsService: IDroxRunSettingsService;
	readonly droxEngineService: IDroxEngineService;
	readonly logService: ILogService;
	readonly slashCommandService: IDroxSlashCommandService;
	readonly commandService: ICommandService;
	readonly editorService: IEditorService;
	readonly terminalService: ITerminalService;
	readonly configurationService: IConfigurationService;
	readonly outputService: IOutputService;
	readonly llmModelsService: IDroxLlmModelsService;
	readonly runRevertService: IDroxRunRevertService;
	readonly sessionService: IDroxSessionService;
	readonly clipboardService: IClipboardService;
	readonly workspaceContextService: IWorkspaceContextService;
}

export async function routeDroxChatWebviewMessage(
	host: IDroxChatWebviewRouterHost,
	tabs: DroxChatTabsManager,
	deps: IDroxChatWebviewRouterDeps,
	raw: DroxWebviewToHostMessage,
): Promise<void> {
	switch (raw.type) {
		case 'webviewReady':
			host.syncWebviewAfterAttach();
			break;
		case 'refreshLlmModels':
			await refreshDroxChatLlmModels(
				host,
				deps.llmModelsService,
				deps.runSettingsService,
				deps.configurationService,
			);
			break;
		case 'setModel':
		case 'setArchitectModel':
			await setDroxArchitectModelFromWebview(deps, raw.model);
			break;
		case 'setExecutorModel':
			await setDroxExecutorModelFromWebview(deps, raw.model);
			break;
		case 'setArchitectLlmParams':
			await setDroxArchitectLlmParamsFromWebview(deps, {
				numCtx: raw.numCtx,
				topP: raw.topP,
				topK: raw.topK,
				repeatPenalty: raw.repeatPenalty,
				minP: raw.minP,
				seed: raw.seed,
				temperature: raw.temperature,
			});
			break;
		case 'setExecutorLlmParams':
			await setDroxExecutorLlmParamsFromWebview(deps, {
				numCtx: raw.numCtx,
				topP: raw.topP,
				topK: raw.topK,
				repeatPenalty: raw.repeatPenalty,
				minP: raw.minP,
				seed: raw.seed,
				temperature: raw.temperature,
			});
			break;
		case 'setOrchestrationMaxParallelExecutors':
			await setDroxOrchestrationMaxParallelExecutorsFromWebview(deps, raw.value);
			break;
		case 'setGeneralSettings':
			await setDroxGeneralSettingsFromWebview(deps, raw.settings as IDroxGeneralSettingsPatch);
			pushGeneralSettingsToWebview(host, deps.runSettingsService, deps.configurationService);
			break;
		case 'send':
			await executeDroxChatSend(host, tabs, deps, raw.prompt, raw.mode, raw.attachments, raw.references, raw.pastes);
			break;
		case 'setPermissionMode': {
			const mode = normalizeDroxPermissionMode(raw.permissionMode);
			await deps.configurationService.updateValue(DroxSetting.PermissionMode, mode);
			break;
		}
		case 'setArchitectInteractionMode': {
			const mode = normalizeDroxArchitectInteractionMode(raw.architectInteractionMode);
			await deps.configurationService.updateValue(DroxSetting.ArchitectInteractionMode, mode);
			break;
		}
		case 'cancelRun':
			cancelDroxChatRun(host, {
				userAskService: deps.userAskService,
				droxEngineService: deps.droxEngineService,
				logService: deps.logService,
				runRevertService: deps.runRevertService,
			});
			break;
		case 'revertLastRun':
			await handleDroxRevertLastRun(host, deps);
			break;
		case 'revertToMessage':
			if (host.getCurrentRunId()) {
				host.post({
					kind: 'append',
					role: 'system',
					text: localize('drox.revert.busy', 'Stop the current run before restoring to a message.'),
				});
				break;
			}
			await handleDroxRevertToMessage(host, deps, raw.messageId);
			break;
		case 'exportTranscript':
			await handleDroxExportTranscript(
				tabs,
				deps.sessionService,
				deps.workspaceContextService,
				deps.clipboardService,
				deps.notificationService,
			);
			break;
		case 'userAskAnswer':
			deps.userAskService.handleWebviewAnswer(raw);
			break;
		case 'slash':
			await handleDroxSlashMessage(host, tabs, deps, raw);
			break;
		case 'listSessions':
			await tabs.sendSessionsList();
			break;
		case 'resetWorkspace':
			await confirmAndResetWorkspaceDroxData(deps.dialogService, tabs);
			break;
		case 'loadSession':
			await tabs.loadSession(raw.sessionId);
			break;
		case 'loadSessionOlder':
			await tabs.loadOlderSessionHistory(raw.sessionId, raw.beforeIndex);
			break;
		case 'switchTab':
			await tabs.switchChatTab(raw.sessionId);
			break;
		case 'closeTab':
			await tabs.closeChatTab(raw.sessionId);
			break;
		case 'newChat':
			tabs.openNewChatTab();
			host.post({
				kind: 'append',
				role: 'system',
				text: localize('drox.slash.newChat', 'New conversation — local session reset.'),
			});
			break;
		case 'openFile':
			await openDroxWorkspaceFile(
				host,
				deps.editorService,
				deps.notificationService,
				deps.outputService,
				deps.logService,
				raw.filePath,
			);
			break;
		case 'openSettings':
			await deps.commandService.executeCommand(DroxCommands.OpenSettings);
			break;
		case 'pickReferences':
			await deps.commandService.executeCommand(DroxCommands.AddReferences);
			break;
		case 'openPasteSource':
			await openDroxPasteSource(host, deps.editorService, deps.terminalService, deps.logService, raw);
			break;
		case 'pathComplete':
			await handleDroxPathComplete(host, deps.fileService, raw.requestId, raw.query);
			break;
		case 'composerDrop':
			await handleDroxComposerDropFromWebview(host, deps.logService);
			break;
	}
}

async function handleDroxSlashMessage(
	host: IDroxChatWebviewRouterHost,
	tabs: DroxChatTabsManager,
	deps: IDroxChatWebviewRouterDeps,
	raw: Extract<DroxWebviewToHostMessage, { type: 'slash' }>,
): Promise<void> {
	if (typeof raw.slashInvalid === 'string' && raw.slashInvalid.length > 0) {
		host.post({ kind: 'append', role: 'error', text: raw.slashInvalid });
		return;
	}
	const command = typeof raw.command === 'string' ? raw.command.trim().toLowerCase() : '';
	const args = typeof raw.args === 'string' ? raw.args.trim() : '';
	await deps.slashCommandService.handleSlash({
		post: (msg: DroxSlashHostMessage) => {
			if (msg.kind === 'compact') {
				host.post({ kind: 'compact', active: msg.active });
				return;
			}
			host.post(msg);
		},
		getCurrentSessionId: () => tabs.currentSessionId,
		getCurrentRunId: () => host.getCurrentRunId(),
		startNewChat: () => tabs.openNewChatTab(),
	}, command, args);
}

async function handleDroxComposerDropFromWebview(
	host: IDroxChatWebviewRouterHost,
	logService: ILogService,
): Promise<void> {
	const peeked = [...host.getPeekedDropUris()];
	host.setPeekedDropUris([]);
	host.post({ kind: 'dropHighlight', active: false });
	const dragDrop = host.getChatDragDrop();
	if (!peeked.length || !dragDrop) {
		return;
	}
	try {
		const result = await dragDrop.resolvePeekedUris(peeked);
		host.applyDropResult(result);
	} catch (err) {
		logService.warn('[Drox] composer drop from webview failed', err);
	}
}
