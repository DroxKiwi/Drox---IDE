/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { RpcRequestHandler, RpcRequestResult } from './droxRpc.js';
import { normalizeClientToolInput } from './droxToolInputNormalize.js';



/** Paramètres `tool/exec` (aligné `drox-cli/src/jsonrpc/protocol.rs`). */

export interface IDroxToolExecParams {

	readonly runId: string;

	readonly callId: string;

	readonly toolName: string;

	readonly input: unknown;

	readonly workspace: string;

	readonly planMode?: boolean;

	readonly applyFsWrites?: boolean;

	/** Session toggle: allow absolute paths outside the workspace. */
	readonly allowOutsideWorkspace?: boolean;

}



export interface IDroxToolExecResult {

	readonly output: unknown;

	readonly isError?: boolean;

}



export type DroxClientToolHandler = (params: IDroxToolExecParams) => Promise<IDroxToolExecResult>;



export class DroxClientToolRegistry {



	private readonly handlers = new Map<string, DroxClientToolHandler>();



	register(name: string, handler: DroxClientToolHandler): void {

		this.handlers.set(name, handler);

	}



	executableToolNames(): string[] {

		return Array.from(this.handlers.keys()).sort();

	}



	toRequestHandler(getActiveRunId: () => string | undefined): RpcRequestHandler {

		return async (rawParams) => {

			const p = rawParams as IDroxToolExecParams | undefined;

			if (!p || typeof p.toolName !== 'string') {

				return {

					error: {

						code: -32602,

						message: 'tool/exec: missing or invalid params',

					},

				} satisfies RpcRequestResult;

			}

			const activeRunId = getActiveRunId();

			if (!activeRunId || activeRunId !== p.runId) {

				return {

					result: {

						output: {
							error: activeRunId
								? `stale run id (active=${activeRunId}, requested=${p.runId})`
								: 'no active Drox run (tool/exec rejected)',
						},

						isError: true,

					} satisfies IDroxToolExecResult,

				};

			}

			const handler = this.handlers.get(p.toolName);

			if (!handler) {

				return {

					result: {

						output: {

							error: `tool not implemented by client: ${p.toolName}`,

						},

						isError: true,

					} satisfies IDroxToolExecResult,

				};

			}

			try {

				const normalizedInput = normalizeClientToolInput(p.toolName, p.input);

				const out = await handler({ ...p, input: normalizedInput });

				return { result: out };

			} catch (e) {

				const message = e instanceof Error ? e.message : String(e);

				return {

					result: {

						output: { error: message },

						isError: true,

					} satisfies IDroxToolExecResult,

				};

			}

		};

	}

}


