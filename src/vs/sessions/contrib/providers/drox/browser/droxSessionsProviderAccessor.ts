/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import type { DroxSessionsProvider } from './droxSessionsProvider.js';

let providerInstance: DroxSessionsProvider | undefined;

export function registerDroxSessionsProviderInstance(provider: DroxSessionsProvider): void {
	providerInstance = provider;
}

export function getDroxSessionsProviderInstance(): DroxSessionsProvider | undefined {
	return providerInstance;
}
