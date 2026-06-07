/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IDroxUpdateService = createDecorator<IDroxUpdateService>('droxUpdateService');

export interface IDroxUpdateCheckResult {
	readonly kind: 'update_available' | 'up_to_date' | 'skipped' | 'error';
	readonly currentVersion?: string;
	readonly latestVersion?: string;
	readonly message?: string;
}

export interface IDroxUpdateCheckOptions {
	/** Ignore « Plus tard » for this session (manual check). */
	readonly ignoreDismissed?: boolean;
	/** Show an info toast when already up to date (typical for manual check). */
	readonly notifyIfUpToDate?: boolean;
}

export interface IDroxUpdateService {
	readonly _serviceBrand: undefined;

	checkForUpdates(options?: IDroxUpdateCheckOptions): Promise<IDroxUpdateCheckResult>;
}
