/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IDroxAttachmentPayload, IDroxPersistedAttachment } from './droxAttachments.js';

export const IDroxAttachmentsService = createDecorator<IDroxAttachmentsService>('droxAttachmentsService');

export interface IDroxAttachmentsService {
	readonly _serviceBrand: undefined;

	persistAttachments(workspaceRoot: string, attachments: readonly IDroxAttachmentPayload[]): Promise<IDroxPersistedAttachment[]>;
}
