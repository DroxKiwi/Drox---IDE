/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Fenêtre Agents Drox : garantit `workbench.editor.useModal: 'some'` pour activer
 * les working sets per-session (voir BaseLayoutController [B2]).
 */

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { isDroxAgentsWindowEnabled } from '../../../../workbench/contrib/drox/common/droxAgentsConfiguration.js';

const DROX_SESSIONS_LAYOUT_USE_MODAL_MIGRATION_KEY = 'drox.sessionsLayout.migratedUseModalForWorkingSets';

class DroxSessionsLayoutContribution implements IWorkbenchContribution {

	static readonly ID = 'drox.sessionsLayout.useModal';

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		if (!isDroxAgentsWindowEnabled(_configurationService)) {
			return;
		}
		void this._migrateUseModalForSessionLayout();
	}

	private async _migrateUseModalForSessionLayout(): Promise<void> {
		if (this._storageService.getBoolean(DROX_SESSIONS_LAYOUT_USE_MODAL_MIGRATION_KEY, StorageScope.APPLICATION, false)) {
			return;
		}

		if (this._configurationService.getValue<string>('workbench.editor.useModal') === 'all') {
			await this._configurationService.updateValue('workbench.editor.useModal', 'some', ConfigurationTarget.USER);
		}

		this._storageService.store(DROX_SESSIONS_LAYOUT_USE_MODAL_MIGRATION_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}

registerWorkbenchContribution2(
	DroxSessionsLayoutContribution.ID,
	DroxSessionsLayoutContribution,
	WorkbenchPhase.BlockStartup,
);
