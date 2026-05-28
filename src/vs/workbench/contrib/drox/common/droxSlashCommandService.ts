/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IDroxSlashCommandService = createDecorator<IDroxSlashCommandService>('droxSlashCommandService');

/** Messages the slash handler may emit (subset of host → webview). */
export type DroxSlashHostMessage =
	| { readonly kind: 'append'; readonly role: 'error' | 'system'; readonly text: string }
	| { readonly kind: 'chatReset' }
	| { readonly kind: 'compact'; readonly active: boolean };

export interface IDroxSlashCommandContext {
	readonly post: (message: DroxSlashHostMessage) => void;
	readonly getCurrentSessionId: () => string | undefined;
	readonly getCurrentRunId: () => string | undefined;
	readonly startNewChat: () => void;
}

export interface IDroxSlashCommandService {
	readonly _serviceBrand: undefined;

	handleSlash(ctx: IDroxSlashCommandContext, command: string, args: string): Promise<void>;
}
