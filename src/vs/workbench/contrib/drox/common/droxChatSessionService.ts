/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';



export const IDroxChatSessionService = createDecorator<IDroxChatSessionService>('droxChatSessionService');



/** Session / run courants du panneau chat Drox (pour outils client IDE). */

export interface IDroxChatSessionService {

	readonly _serviceBrand: undefined;



	getSessionId(): string | undefined;



	getRunId(): string | undefined;



	setSessionId(id: string | undefined): void;



	setRunId(id: string | undefined): void;

	getPendingSessionReset(): boolean;

	setPendingSessionReset(value: boolean): void;

}

