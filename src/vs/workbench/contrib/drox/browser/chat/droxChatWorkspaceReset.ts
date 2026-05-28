/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { DroxChatTabsManager } from './droxChatTabsManager.js';

export async function confirmAndResetWorkspaceDroxData(
	dialogService: IDialogService,
	tabs: DroxChatTabsManager,
): Promise<void> {
	const { confirmed } = await dialogService.confirm({
		type: 'warning',
		message: localize('drox.resetWorkspace.title', 'Réinitialiser les données Drox de ce workspace ?'),
		detail: localize(
			'drox.resetWorkspace.detail',
			'Tout le contenu de `.drox/` sera supprimé définitivement.\n\nConservé : `.drox/.env` uniquement.',
		),
		primaryButton: localize(
			{ key: 'drox.resetWorkspace.confirm', comment: ['&& denotes a mnemonic'] },
			'&&Réinitialiser',
		),
		cancelButton: localize('drox.resetWorkspace.cancel', 'Annuler'),
	});
	if (!confirmed) {
		return;
	}
	await tabs.resetWorkspaceDroxData();
}
