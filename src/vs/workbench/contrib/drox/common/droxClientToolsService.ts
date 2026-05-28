/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';



export const IDroxClientToolsService = createDecorator<IDroxClientToolsService>('droxClientToolsService');



export interface IDroxClientToolsService {

	readonly _serviceBrand: undefined;

	readonly executableToolNames: readonly string[];

}


