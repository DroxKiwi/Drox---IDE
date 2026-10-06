/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Garde IDE : `workbench.editor.useModal: 'all'` (mode dialog Agents) ne doit jamais
 * s’appliquer à la fenêtre IDE principale. Les clics Explorer / onglets restent des
 * onglets ; le overlay modal reste réservé à la fenêtre Agents.
 *
 * Cause : l’action « Open in Modal Editor » (Agents) écrivait `useModal: 'all'` en
 * USER — setting partagé — donc l’IDE ouvrait aussi tout en dialog.
 */

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IsSessionsWindowContext } from '../../../common/contextkeys.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

const USE_MODAL_SETTING = 'workbench.editor.useModal';

class DroxIdeUseModalGuardContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxIdeUseModalGuard';

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		// Fenêtre Agents : laisser le toggle modal-all intact.
		if (IsSessionsWindowContext.getValue(contextKeyService)) {
			return;
		}

		void this._clampStickyUserAll();
		this._shieldIdeFromModalAll();

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(USE_MODAL_SETTING)) {
				this._shieldIdeFromModalAll();
			}
		}));
	}

	/** Nettoie un USER `'all'` laissé par une session Agents précédente. */
	private async _clampStickyUserAll(): Promise<void> {
		const inspected = this._configurationService.inspect<string>(USE_MODAL_SETTING);
		if (inspected.userValue === 'all' || inspected.userLocalValue === 'all' || inspected.userRemoteValue === 'all') {
			await this._configurationService.updateValue(USE_MODAL_SETTING, 'some', ConfigurationTarget.USER);
		}
	}

	/**
	 * Si Agents bascule USER → `'all'` pendant que l’IDE est ouvert, un override
	 * MEMORY local empêche l’IDE d’ouvrir les fichiers en dialog.
	 */
	private _shieldIdeFromModalAll(): void {
		if (this._configurationService.getValue<string>(USE_MODAL_SETTING) === 'all') {
			void this._configurationService.updateValue(USE_MODAL_SETTING, 'some', ConfigurationTarget.MEMORY);
		}
	}
}

registerWorkbenchContribution2(
	DroxIdeUseModalGuardContribution.ID,
	DroxIdeUseModalGuardContribution,
	WorkbenchPhase.BlockStartup,
);
