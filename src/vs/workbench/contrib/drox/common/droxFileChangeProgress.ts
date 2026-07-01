/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { VSBuffer } from '../../../../base/common/buffer.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ChatExternalEditKind, IChatExternalEdit, IChatProgress } from '../../chat/common/chatService/chatService.js';
import { DroxCommands } from './drox.js';
import { droxNativeFileChangeMarkdownProgress } from './droxNativeFileChangeMarkdown.js';
import {
	extractOutputPath,
	IDroxFileChangePayload,
	resolveFileChangePayload,
} from './droxFileChange.js';
import {
	inferFileToolName,
	isFileMutationToolName,
	normalizeToolFinishOutput,
	toolOutputIndicatesApplied,
} from './droxFileMutation.js';
import { normalizeWindowsFsPath } from './droxPathUtil.js';
import { IDroxRunRevertService } from './droxRunRevertService.js';

export interface IDroxFileChangeResolution {
	readonly change: IDroxFileChangePayload;
	readonly canUndo: boolean;
	readonly beforeSnapshotUri?: URI;
}

export interface IDroxResolveFileChangeDeps {
	readonly fileService: IFileService;
	readonly runRevertService: IDroxRunRevertService;
}

async function readAfterContent(
	fileService: IFileService,
	absPath: string,
	out: Record<string, unknown>,
): Promise<string> {
	if (typeof out.new_content === 'string') {
		return out.new_content;
	}
	if (typeof out.content === 'string') {
		return out.content;
	}
	try {
		const read = await fileService.readFile(URI.file(normalizeWindowsFsPath(absPath)));
		return read.value.toString();
	} catch {
		return '';
	}
}

function sanitizeSnapshotToolId(toolId: string): string {
	return String(toolId || 'tool').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

async function writeBeforeSnapshotUri(
	fileService: IFileService,
	workspaceRoot: string | undefined,
	toolId: string,
	beforeContent: string,
): Promise<URI | undefined> {
	if (!workspaceRoot || !beforeContent) {
		return undefined;
	}
	const safeId = sanitizeSnapshotToolId(toolId);
	const absPath = join(workspaceRoot, '.drox', 'diff-snapshots', `${safeId}.before`);
	const uri = URI.file(absPath);
	const parent = URI.file(join(workspaceRoot, '.drox', 'diff-snapshots'));
	await fileService.createFolder(parent);
	await fileService.writeFile(uri, VSBuffer.fromString(beforeContent));
	return uri;
}

function mapFileChangeEditKind(change: IDroxFileChangePayload): ChatExternalEditKind {
	if (change.op === 'delete') {
		return 'delete';
	}
	if (change.op === 'write' && change.removed === 0) {
		return 'create';
	}
	return 'edit';
}

export function fileChangeToExternalEdit(
	change: IDroxFileChangePayload,
	toolId: string,
	beforeSnapshotUri?: URI,
): IChatExternalEdit {
	const uri = URI.file(change.path);
	const editKind = mapFileChangeEditKind(change);
	const diff = change.added > 0 || change.removed > 0
		? { added: change.added, removed: change.removed }
		: undefined;
	return {
		kind: 'externalEdit',
		uri,
		editKind,
		beforeContentUri: beforeSnapshotUri,
		afterContentUri: change.applied && editKind !== 'delete' ? uri : undefined,
		diff,
		undoStopId: toolId || undefined,
	};
}

export function fileChangeResolutionToChatProgress(resolution: IDroxFileChangeResolution): IChatProgress[] {
	const tid = String(resolution.change.toolId || '').trim();
	const parts: IChatProgress[] = [
		fileChangeToExternalEdit(resolution.change, tid, resolution.beforeSnapshotUri),
		droxNativeFileChangeMarkdownProgress(resolution.change),
	];
	if (resolution.canUndo && tid) {
		parts.push({
			kind: 'command',
			command: {
				id: DroxCommands.UndoFileChange,
				title: localize('drox.fileChange.undo', 'Undo file change'),
				arguments: [tid],
			},
			additionalCommands: [{
				id: DroxCommands.RedoFileChange,
				title: localize('drox.fileChange.redo', 'Redo file change'),
				arguments: [tid],
			}],
		});
	}
	return parts;
}

export async function resolveDroxFileChangeAfterToolFinish(
	deps: IDroxResolveFileChangeDeps,
	options: {
		readonly workspaceRoot: string | undefined;
		readonly pendingName: string | undefined;
		readonly output: unknown;
		readonly isError: boolean;
		readonly toolId: string;
		readonly pendingArgs?: unknown;
	},
): Promise<IDroxFileChangeResolution | null> {
	if (options.isError) {
		return null;
	}
	const out = normalizeToolFinishOutput(options.output);
	if (!out) {
		return null;
	}
	let name = isFileMutationToolName(options.pendingName) ? options.pendingName : inferFileToolName(out);
	if (!name) {
		return null;
	}
	const applied = toolOutputIndicatesApplied(name, out);
	const filePath = extractOutputPath(out);
	if (!filePath) {
		return null;
	}
	const tid = String(options.toolId || '').trim();
	const captured = deps.runRevertService.getCapturedBefore(filePath);
	const changeBase = await resolveFileChangePayload(
		options.workspaceRoot,
		name,
		out,
		options.pendingArgs,
		{
			applied,
			cancelled: out.cancelled === true,
			proposed: out.proposed === true,
		},
		async (absPath) => readAfterContent(deps.fileService, absPath, out),
		captured?.beforeContent ?? '',
	);
	if (!changeBase) {
		return null;
	}
	let canUndo = false;
	let beforeSnapshotUri: URI | undefined;
	if (applied && tid && tid !== '?') {
		const afterContent = await readAfterContent(deps.fileService, filePath, out);
		if (captured && afterContent.length > 0) {
			deps.runRevertService.trackFileChange({
				toolId: tid,
				absPath: filePath,
				beforeContent: captured.beforeContent,
				afterContent,
				hadFile: captured.hadFile,
			});
			canUndo = true;
			beforeSnapshotUri = await writeBeforeSnapshotUri(
				deps.fileService,
				options.workspaceRoot,
				tid,
				captured.beforeContent,
			);
		}
	}
	return {
		change: { ...changeBase, toolId: tid || undefined, canUndo },
		canUndo,
		beforeSnapshotUri,
	};
}
