/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const DROX_BASH_OUTPUT_CHANNEL_ID = 'droxBash';



export interface IDroxBashExecArgs {

	readonly command: string;

	readonly cwd?: string;

	readonly timeoutMs?: number;

}



export interface IDroxBashExecResult {

	readonly command: string;

	readonly exit_code: number | null;

	readonly stdout: string;

	readonly stderr: string;

	readonly timed_out: boolean;

	readonly duration_ms: number;

	readonly error?: string;

}

