/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ITextEditorSelection } from '../../../../../platform/editor/common/editor.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IOutputService } from '../../../../services/output/common/output.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import {
	asFileChangeHostMessage,
	extractOutputPath,
	resolveFileChangePayload,
} from '../../common/droxFileChange.js';
import {
	inferFileToolName,
	isFileMutationToolName,
	normalizeToolFinishOutput,
	toolOutputIndicatesApplied,
} from '../../common/droxFileMutation.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IDroxRunRevertService } from '../../common/droxRunRevertService.js';
import { shouldAutoOpenModifiedFilePath } from '../../common/droxOpenModified.js';
import { DROX_TERMINAL_SMART_PASTE_ABS_SENTINEL } from '../../common/droxPasteCandidates.js';
import { completeWorkspacePaths } from '../../common/droxPromptCompletion.js';
import { sanitizePathForEditor } from '../../common/droxPathUtil.js';
import { droxUiLogLine } from '../../common/droxUiLog.js';
import { resolveAfterContentForFileChange } from './droxChatFileChangeUndo.js';
import { DroxHostToWebviewMessage } from '../droxChatBridge.js';

export interface IDroxChatFileActionsHost {
	post(message: DroxHostToWebviewMessage): void;
	workspaceRoot(): string | undefined;
	workspaceUri(): URI | undefined;
}

export async function handleDroxPathComplete(
	host: IDroxChatFileActionsHost,
	fileService: IFileService,
	requestId: string,
	query: string,
): Promise<void> {
	const ws = host.workspaceRoot();
	if (!ws) {
		host.post({
			kind: 'pathCompleteResult',
			requestId,
			items: [],
			error: localize('drox.pathCompleteNoWorkspace', 'No workspace folder is open.'),
		});
		return;
	}
	const items = await completeWorkspacePaths(fileService, ws, query);
	host.post({ kind: 'pathCompleteResult', requestId, items });
}

export async function openDroxPasteSource(
	host: IDroxChatFileActionsHost,
	editorService: IEditorService,
	terminalService: ITerminalService,
	logService: ILogService,
	msg: {
		kind?: string;
		absPath?: string;
		relPath?: string | null;
		startLine?: number;
		endLine?: number;
	},
): Promise<void> {
	const abs = typeof msg.absPath === 'string' ? msg.absPath : '';
	const isTerminal =
		msg.kind === 'terminal' || abs === DROX_TERMINAL_SMART_PASTE_ABS_SENTINEL;

	if (isTerminal) {
		const wantName = typeof msg.relPath === 'string' ? msg.relPath.trim() : '';
		const instances = terminalService.instances;
		let target = wantName
			? instances.find(t => t.title === wantName)
			: undefined;
		if (!target) {
			target = terminalService.activeInstance ?? instances[instances.length - 1];
		}
		if (target) {
			terminalService.setActiveInstance(target);
			target.focus();
		}
		return;
	}

	if (!abs) {
		return;
	}
	const startLine = Math.max(1, Math.floor(msg.startLine ?? 1));
	const endLine = Math.max(startLine, Math.floor(msg.endLine ?? startLine));
	const selection: ITextEditorSelection = {
		startLineNumber: startLine,
		startColumn: 1,
		endLineNumber: endLine,
		endColumn: 1,
	};
	try {
		await editorService.openEditor({
			resource: URI.file(abs),
			options: { selection, pinned: false },
		});
	} catch (e) {
		logService.warn(`[Drox] openPasteSource: ${e instanceof Error ? e.message : String(e)}`);
	}
}

export async function openDroxWorkspaceFile(
	host: IDroxChatFileActionsHost,
	editorService: IEditorService,
	notificationService: INotificationService,
	outputService: IOutputService,
	logService: ILogService,
	filePath: string,
	options: { preserveFocus?: boolean } = {},
): Promise<void> {
	const safePath = sanitizePathForEditor(filePath);
	if (!safePath) {
		droxUiLogLine(outputService, `openFile skipped (invalid path): ${filePath.slice(0, 120)}`);
		logService.warn(`[Drox] openFile ignored (invalid path): ${filePath.slice(0, 120)}`);
		return;
	}
	try {
		await editorService.openEditor({
			resource: URI.file(safePath),
			options: {
				pinned: true,
				preserveFocus: options.preserveFocus === true,
			},
		});
	} catch (e) {
		notificationService.warn(
			localize('drox.openFileFailed', 'Drox: could not open {0}', filePath),
		);
		logService.warn('[Drox] openFile', e);
	}
}

export function handleDroxFileMutationAfterToolFinish(
	host: IDroxChatFileActionsHost,
	deps: {
		readonly configurationService: IConfigurationService;
		readonly outputService: IOutputService;
		readonly editorService: IEditorService;
		readonly notificationService: INotificationService;
		readonly logService: ILogService;
		readonly fileService: IFileService;
		readonly runRevertService: IDroxRunRevertService;
	},
	pendingName: string | undefined,
	output: unknown,
	isError: boolean,
	toolId: string,
	pendingArgs?: unknown,
): void {
	if (isError) {
		return;
	}

	const out = normalizeToolFinishOutput(output);
	if (!out) {
		return;
	}

	let name = isFileMutationToolName(pendingName) ? pendingName : inferFileToolName(out);
	if (!name) {
		return;
	}

	if (!isFileMutationToolName(pendingName)) {
		droxUiLogLine(
			deps.outputService,
			`file_change: id=${toolId} inferred name=${name} (no matching pending)`,
		);
	}

	const applied = toolOutputIndicatesApplied(name, out);
	const filePath = extractOutputPath(out);
	if (!filePath) {
		droxUiLogLine(deps.outputService, `file_change: skip (${name} missing path, id=${toolId})`);
		return;
	}

	const tid = String(toolId || '').trim();

	void (async () => {
		const captured = deps.runRevertService.getCapturedBefore(filePath);
		const changeBase = await resolveFileChangePayload(
			host.workspaceRoot(),
			name,
			out,
			pendingArgs,
			{
				applied,
				cancelled: out.cancelled === true,
				proposed: out.proposed === true,
			},
			async (absPath) => resolveAfterContentForFileChange(deps.fileService, absPath, out),
			captured?.beforeContent ?? '',
		);
		if (!changeBase) {
			if (!applied) {
				droxUiLogLine(
					deps.outputService,
					`file_change: skip (${name} not applied, no preview, id=${toolId})`,
				);
			}
			return;
		}

		droxUiLogLine(
			deps.outputService,
			`file_change: post ${name} ${changeBase.relPath} +${changeBase.added}/-${changeBase.removed} diff=${changeBase.diff.length} content=${changeBase.content.length} id=${toolId}`,
		);

		let canUndo = false;
		if (applied && tid && tid !== '?') {
			const afterContent = await resolveAfterContentForFileChange(deps.fileService, filePath, out);
			if (captured && afterContent.length > 0) {
				deps.runRevertService.trackFileChange({
					toolId: tid,
					absPath: filePath,
					beforeContent: captured.beforeContent,
					afterContent,
					hadFile: captured.hadFile,
				});
				canUndo = true;
			}
		}

		const change = { ...changeBase, toolId: tid || undefined, canUndo };
		host.post(asFileChangeHostMessage(change, tid || undefined));

		if (applied && shouldAutoOpenModifiedFilePath(
			deps.configurationService,
			filePath,
			host.workspaceRoot(),
			host.workspaceUri(),
		)) {
			droxUiLogLine(deps.outputService, `file_change: open ${name} → ${filePath}`);
			void openDroxWorkspaceFile(
				host,
				deps.editorService,
				deps.notificationService,
				deps.outputService,
				deps.logService,
				filePath,
				{ preserveFocus: true },
			);
		} else if (applied) {
			droxUiLogLine(
				deps.outputService,
				`file_change: skip auto-open (${name} under .drox/agent-output or setting off, id=${toolId})`,
			);
		}
	})();
}
