/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

export type DroxPortsProtocol = 'http' | 'https' | 'tcp';

export type DroxPortsOnReady = 'none' | 'notify' | 'preview' | 'browser';

export type DroxPortsRuntimeStatus = 'idle' | 'starting' | 'up' | 'error' | 'stopping';

/** External forward tool profile (user scope). */
export interface IDroxPortsTool {
	readonly id: string;
	readonly label: string;
	readonly command: string;
	readonly args: readonly string[];
	readonly env?: Readonly<Record<string, string>>;
	readonly cwd?: string;
}

/** Declared forward (workspace / user). */
export interface IDroxPortsForward {
	readonly id: string;
	readonly label: string;
	readonly remoteHost: string;
	readonly remotePort: number;
	readonly localHost: string;
	readonly localPort: number;
	readonly protocol: DroxPortsProtocol;
	readonly onReady: DroxPortsOnReady;
	/** Override `drox.ports.defaultToolId`. */
	readonly toolId?: string;
}

export interface IDroxPortsRuntimeState {
	readonly forwardId: string;
	readonly status: DroxPortsRuntimeStatus;
	readonly error?: string;
	readonly pid?: number;
	readonly startedAt?: number;
}

export interface IDroxPortsResolvedLaunch {
	readonly command: string;
	readonly args: readonly string[];
	readonly env: Readonly<Record<string, string>>;
	readonly cwd?: string;
	readonly localHost: string;
	readonly localPort: number;
}
