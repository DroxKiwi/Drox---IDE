/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type RpcIncoming =
	| { jsonrpc: '2.0'; id: number | string | null; result?: unknown; error?: RpcError }
	| { jsonrpc: '2.0'; id: number | string; method: string; params?: unknown }
	| { jsonrpc: '2.0'; method: string; params?: unknown };

export interface RpcError {
	code: number;
	message: string;
	data?: unknown;
}

export type RpcRequestResult =
	| { result: unknown; error?: undefined }
	| { result?: undefined; error: RpcError };

export type RpcRequestHandler = (params: unknown) => Promise<RpcRequestResult>;

export interface InitializeOptions {
	executableTools?: string[];
	interactiveAsk?: boolean;
}
