/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';



export const IDroxClientToolsService = createDecorator<IDroxClientToolsService>('droxClientToolsService');



export interface IDroxClientToolsService {

	readonly _serviceBrand: undefined;

	readonly executableToolNames: readonly string[];

	/**
	 * Interrupt a stuck bash (IDE terminal Ctrl+C, else main-process ExecBash)
	 * and unblock tool/exec so the agent can continue. Returns true when a run
	 * was skipped.
	 */
	skipActiveBash(): Promise<boolean>;

}


