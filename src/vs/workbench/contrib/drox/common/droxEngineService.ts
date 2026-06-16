/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Event } from '../../../../base/common/event.js';

/** Résultat partiel de `initialize` (camelCase côté IDE). */
export type DroxEngineInitializeResult = {
	readonly serverVersion?: string;
	readonly orchestrationPipeline?: string;
	readonly devBuild?: number;
	readonly engineGitSha?: string;
};
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IDroxEngineErrorPayload, IDroxEngineExitPayload, IDroxEngineLogPayload, IDroxEngineNotificationPayload, IDroxEngineServerRequestPayload } from './droxIpc.js';
import { InitializeOptions, RpcRequestHandler, RpcRequestResult } from './droxRpc.js';

export const IDroxEngineService = createDecorator<IDroxEngineService>('droxEngineService');

export interface IDroxEngineService {
	readonly _serviceBrand: undefined;

	readonly onLog: Event<IDroxEngineLogPayload>;
	readonly onNotification: Event<IDroxEngineNotificationPayload>;
	readonly onServerRequest: Event<IDroxEngineServerRequestPayload>;
	readonly onExit: Event<IDroxEngineExitPayload>;
	readonly onError: Event<IDroxEngineErrorPayload>;

	readonly isStarted: boolean;

	/** `initialize` JSON-RPC completed successfully for this engine instance. */
	readonly isInitialized: boolean;

	/** Stamp compilé dans `drox.exe` (`build.rs`), lu à `initialize`. */
	readonly engineDevBuild: number | undefined;

	/** Revision git courte compilée dans `drox.exe` (`build.rs`). */
	readonly engineGitSha: string | undefined;

	/** Chemin `drox.exe` résolu pour cette fenêtre (dernier `start`). */
	readonly resolvedExecutable: string | undefined;

	/** Émis après chaque `initialize` réussi (warm start ou premier run). */
	readonly onDidInitialize: Event<DroxEngineInitializeResult>;

	/** Spawn `drox --serve` in the main process (idempotent per window). */
	start(): Promise<void>;

	/** Idempotent per engine instance until shutdown / dispose. */
	initialize(opts?: InitializeOptions): Promise<unknown>;

	request(method: string, params?: unknown): Promise<unknown>;

	/** GET HTTP via le process principal (LLM distant / local, sans CORS renderer). */
	fetchHttp(url: string, headers?: Record<string, string>): Promise<{ statusCode: number; body: string }>;

	setRequestHandler(method: string, handler: RpcRequestHandler): void;

	shutdown(): Promise<void>;

	dispose(): Promise<void>;
}

export type { RpcRequestHandler, RpcRequestResult, InitializeOptions };
