/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { DroxHostToWebviewMessage } from '../browser/droxChatBridge.js';
import { IDroxPersistedRunRecovery } from './droxRunRecoveryPersist.js';
import { IDroxSessionListEntry, IDroxSessionReadResult } from './droxSession.js';

export const IDroxSessionService = createDecorator<IDroxSessionService>('droxSessionService');

export interface IDroxUiReplayTailResult {
	readonly messages: DroxHostToWebviewMessage[];
	readonly hasOlder: boolean;
	readonly totalEventCount: number;
	/** Index du premier message du slice dans le journal complet. */
	readonly oldestLoadedIndex: number;
}

export interface IDroxWorkspaceResetResult {
	readonly sessionsFilesRemoved: number;
	readonly workspaceMapRemoved: boolean;
	readonly longMemoryCleared: boolean;
	readonly memorySessionsFilesRemoved: number;
	readonly attachmentsCleared: boolean;
	readonly courseCyclesCleared: boolean;
	readonly agentOutputCleared: boolean;
	readonly memoryMdRemoved: boolean;
}

export interface IDroxSessionService {
	readonly _serviceBrand: undefined;

	listSessions(workspaceFsPath: string): Promise<IDroxSessionListEntry[]>;

	readSession(id: string, workspaceFsPath: string): Promise<IDroxSessionReadResult>;

	/** Journal des messages hôte→webview pour rejeu fidèle à la fermeture. */
	readUiReplay(id: string, workspaceFsPath: string): Promise<DroxHostToWebviewMessage[]>;

	/** Derniers tours du journal UI (L1 tail-first). */
	readUiReplayTail(
		id: string,
		workspaceFsPath: string,
		opts: { readonly maxTurns: number },
	): Promise<IDroxUiReplayTailResult>;

	readUiReplayOlder(
		id: string,
		workspaceFsPath: string,
		opts: { readonly beforeIndex: number; readonly maxTurns: number },
	): Promise<IDroxUiReplayTailResult>;

	appendUiReplayMessage(id: string, workspaceFsPath: string, message: DroxHostToWebviewMessage): Promise<void>;

	readRunRecovery(id: string, workspaceFsPath: string): Promise<IDroxPersistedRunRecovery | undefined>;

	writeRunRecovery(id: string, workspaceFsPath: string, ctx: IDroxPersistedRunRecovery): Promise<void>;

	clearRunRecovery(id: string, workspaceFsPath: string): Promise<void>;

	resetWorkspace(workspaceFsPath: string): Promise<IDroxWorkspaceResetResult>;

	/** Supprime les artefacts disque d'une session (`ses_*`) dans le workspace. */
	deleteSession(id: string, workspaceFsPath: string): Promise<void>;
}
