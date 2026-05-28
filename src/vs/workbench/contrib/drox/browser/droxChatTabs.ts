/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';

export interface IDroxChatTab {
	readonly sessionId: string;
	title: string;
	titleFromModel: boolean;
	uiStats: { totalIn: number; totalOut: number; ctx: number };
}

export function newSessionId(): string {
	return `ses_${generateUuid()}`;
}

export function emptyTabUiStats(): { totalIn: number; totalOut: number; ctx: number } {
	return { totalIn: 0, totalOut: 0, ctx: 0 };
}
