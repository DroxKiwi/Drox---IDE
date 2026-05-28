/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

import { URI } from '../../../../base/common/uri.js';

import { IDroxSessionCompactResult } from './droxSessionCompact.js';



export const IDroxSessionCompactService = createDecorator<IDroxSessionCompactService>('droxSessionCompactService');



export interface IDroxSessionCompactProgressHooks {

	readonly onActiveChange?: (active: boolean) => void;

}



export interface IDroxSessionCompactService {

	readonly _serviceBrand: undefined;



	compactSession(

		workspaceUri: URI,

		sessionId: string,

		hooks?: IDroxSessionCompactProgressHooks,

	): Promise<IDroxSessionCompactResult>;

}

