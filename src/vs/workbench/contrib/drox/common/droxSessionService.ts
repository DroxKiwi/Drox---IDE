/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { DroxHostToWebviewMessage } from '../browser/droxChatBridge.js';
import { IDroxSessionListEntry, IDroxSessionReadResult } from './droxSession.js';

export const IDroxSessionService = createDecorator<IDroxSessionService>('droxSessionService');

export interface IDroxWorkspaceResetResult {
	readonly sessionsFilesRemoved: number;
	readonly workspaceMapRemoved: boolean;
	readonly longMemoryCleared: boolean;
	readonly memorySessionsFilesRemoved: number;
	readonly attachmentsCleared: boolean;
	readonly courseCyclesCleared: boolean;
	readonly agentOutputCleared: boolean;
}

export interface IDroxSessionService {
	readonly _serviceBrand: undefined;

	listSessions(workspaceFsPath: string): Promise<IDroxSessionListEntry[]>;

	readSession(id: string, workspaceFsPath: string): Promise<IDroxSessionReadResult>;

	/** Journal des messages hôte→webview pour rejeu fidèle à la fermeture. */
	readUiReplay(id: string, workspaceFsPath: string): Promise<DroxHostToWebviewMessage[]>;

	appendUiReplayMessage(id: string, workspaceFsPath: string, message: DroxHostToWebviewMessage): Promise<void>;

	resetWorkspace(workspaceFsPath: string): Promise<IDroxWorkspaceResetResult>;
}
