/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../../nls.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { DroxChatTabsManager } from './droxChatTabsManager.js';

export async function confirmAndResetWorkspaceDroxData(
	dialogService: IDialogService,
	tabs: DroxChatTabsManager,
): Promise<void> {
	const { confirmed } = await dialogService.confirm({
		type: 'warning',
		message: localize('drox.resetWorkspace.title', 'Reset Drox data for this workspace?'),
		detail: localize(
			'drox.resetWorkspace.detail',
			'All contents of `.drox/` will be permanently deleted.\n\nKept: `.drox/.env` only.',
		),
		primaryButton: localize(
			{ key: 'drox.resetWorkspace.confirm', comment: ['&& denotes a mnemonic'] },
			'&&Reset',
		),
		cancelButton: localize('drox.resetWorkspace.cancel', 'Cancel'),
	});
	if (!confirmed) {
		return;
	}
	await tabs.resetWorkspaceDroxData();
}
