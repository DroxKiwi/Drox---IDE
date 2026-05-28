/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IOutputService } from '../../../services/output/common/output.js';

/** Canal diagnostic webview ↔ workbench (distinct du moteur Rust). */
export const DROX_UI_OUTPUT_CHANNEL_ID = 'droxUi';

export function droxUiLogLine(outputService: IOutputService, message: string): void {
	const channel = outputService.getChannel(DROX_UI_OUTPUT_CHANNEL_ID);
	if (!channel) {
		return;
	}
	const ts = new Date().toISOString().slice(11, 23);
	channel.append(`[${ts}] ${message}\n`);
}

export function droxUiLogError(
	outputService: IOutputService,
	context: string,
	err: unknown,
): void {
	const msg = err instanceof Error ? err.message : String(err);
	const stack = err instanceof Error && err.stack ? `\n  ${err.stack}` : '';
	droxUiLogLine(outputService, `${context} ERREUR: ${msg}${stack}`);
}
