/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IDroxReleaseNotesService = createDecorator<IDroxReleaseNotesService>('droxReleaseNotesService');

export interface IDroxReleaseNotesService {
	readonly _serviceBrand: undefined;

	showReleaseNotes(): Promise<void>;
}
