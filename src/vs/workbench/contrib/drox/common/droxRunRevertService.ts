/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Event } from '../../../../base/common/event.js';

export const IDroxRunRevertService = createDecorator<IDroxRunRevertService>('droxRunRevertService');

export interface IDroxRunRevertFileEntry {
	/** Chemin absolu normalisé. */
	readonly absPath: string;
	/** `true` si le fichier existait avant la première mutation du run. */
	readonly hadFile: boolean;
	/** Contenu avant mutation ; ignoré si `hadFile` est false. */
	readonly beforeContent: string;
}

export interface IDroxRunRevertSnapshot {
	readonly runId: string;
	readonly sessionId: string | undefined;
	readonly workspaceRoot: string;
	readonly finishedAt: number;
	readonly files: readonly IDroxRunRevertFileEntry[];
}

export interface IDroxRunRevertCommit extends IDroxRunRevertSnapshot {
	readonly commitId: string;
	readonly firstMessageId?: string;
	readonly lastMessageId?: string;
}

export interface IDroxRunRevertResult {
	readonly revertedPaths: readonly string[];
	readonly errors: readonly string[];
}

export interface IDroxFileChangeUndoEntry {
	readonly toolId: string;
	readonly absPath: string;
	readonly beforeContent: string;
	readonly afterContent: string;
	readonly hadFile: boolean;
}

export type DroxFileChangeUndoState = 'applied' | 'reverted';

export interface IDroxRunRevertService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeRevertable: Event<void>;
	beginRun(runId: string, workspaceRoot: string, sessionId?: string): void;
	/** Associe le message déclencheur (question user) au run. */
	setRunFirstMessageId(runId: string, messageId: string): void;
	/** Enregistre un message du fil produit pendant le run. */
	recordRunMessage(runId: string, messageId: string): void;
	/** Enregistre l'état disque avant la première écriture du run sur ce fichier. */
	captureBeforeWrite(workspaceRoot: string, absPath: string): Promise<void>;
	/** Snapshot avant/après pour undo/redo depuis une carte diff (`toolId`). */
	/** Lecture best-effort du snapshot « avant » capturé pour ce fichier (run actif). */
	getCapturedBefore(absPath: string): IDroxRunRevertFileEntry | undefined;
	trackFileChange(entry: IDroxFileChangeUndoEntry): void;
	getFileChangeUndoState(toolId: string): DroxFileChangeUndoState | undefined;
	undoFileChange(toolId: string): Promise<IDroxRunRevertResult>;
	redoFileChange(toolId: string): Promise<IDroxRunRevertResult>;
	/** Clôture le run courant comme « dernier run annulable » (V1 : un seul niveau). */
	finalizeRun(runId: string): void;
	/** Abandonne le run courant sans remplacer le snapshot annulable. */
	discardActiveRun(): void;
	/** Après purge `.drox/` — état UI revert sans relire l’historique supprimé. */
	resetWorkspaceUiState(): void;
	getLastRevertable(): IDroxRunRevertSnapshot | undefined;
	hasRevertable(): boolean;
	revertLastRun(): Promise<IDroxRunRevertResult>;
	listRevertHistory(workspaceRoot: string, sessionId?: string): Promise<readonly IDroxRunRevertCommit[]>;
	revertToMessage(workspaceRoot: string, messageId: string): Promise<IDroxRunRevertResult>;
}
