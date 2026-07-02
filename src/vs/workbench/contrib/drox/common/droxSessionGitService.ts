/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IDroxSessionGitService = createDecorator<IDroxSessionGitService>('droxSessionGitService');

/** Local git write operations for Drox agent sessions (no Copilot CLI). */
export interface IDroxSessionGitService {
	readonly _serviceBrand: undefined;

	hasUncommittedChanges(workingDirectory: URI): Promise<boolean>;
	getCurrentBranch(workingDirectory: URI): Promise<string | undefined>;
	hasUpstream(workingDirectory: URI, branchName: string): Promise<boolean>;
	commitAll(workingDirectory: URI, message: string): Promise<void>;
	push(workingDirectory: URI, options?: { readonly setUpstream?: boolean }): Promise<void>;
}
