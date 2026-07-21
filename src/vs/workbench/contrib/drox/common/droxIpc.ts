/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

export const DROX_ENGINE_CHANNEL_NAME = 'droxEngine';

export const DROX_OUTPUT_CHANNEL_ID = 'droxEngine';

export const enum DroxEngineCommand {
	Start = 'start',
	Request = 'request',
	RespondServerRequest = 'respondServerRequest',
	ExecBash = 'execBash',
	/** HTTP local (Ollama / OpenAI-compatible) — contourne CORS/proxy du renderer. */
	FetchHttp = 'fetchHttp',
	Shutdown = 'shutdown',
	Dispose = 'dispose',
}

export interface IDroxFetchHttpArgs {
	readonly url: string;
	readonly headers?: Readonly<Record<string, string>>;
	readonly method?: 'GET' | 'POST';
	readonly body?: string;
}

export interface IDroxFetchHttpResult {
	readonly statusCode: number;
	readonly body: string;
}

export const enum DroxEngineEvent {
	OnLog = 'onLog',
	OnNotification = 'onNotification',
	OnServerRequest = 'onServerRequest',
	OnExit = 'onExit',
	OnError = 'onError',
}

export interface IDroxEngineStartArgs {
	readonly windowId: number;
	readonly executable: string;
	readonly cwd: string;
	readonly env?: Record<string, string>;
	/** Hints for main-process bundled `drox.exe` resolution when `executable` is bare `drox`. */
	readonly resolveHints?: {
		readonly configuredPath?: string;
		readonly appRoot?: string;
		readonly workspaceFolderPaths?: readonly string[];
	};
}

export interface IDroxEngineRequestArgs {
	readonly windowId: number;
	readonly method: string;
	readonly params?: unknown;
}

export interface IDroxEngineRespondArgs {
	readonly windowId: number;
	readonly id: number | string;
	readonly payload: { result?: unknown; error?: { code: number; message: string; data?: unknown } };
}

export interface IDroxEngineWindowPayload {
	readonly windowId: number;
}

export interface IDroxEngineLogPayload extends IDroxEngineWindowPayload {
	readonly text: string;
}

export interface IDroxEngineNotificationPayload extends IDroxEngineWindowPayload {
	readonly method: string;
	readonly params: unknown;
}

export interface IDroxEngineServerRequestPayload extends IDroxEngineWindowPayload {
	readonly id: number | string;
	readonly method: string;
	readonly params: unknown;
}

export interface IDroxEngineExitPayload extends IDroxEngineWindowPayload {
	readonly code: number | null;
	readonly signal: string | null;
}

export interface IDroxEngineErrorPayload extends IDroxEngineWindowPayload {
	readonly message: string;
}
