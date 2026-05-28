/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';

import { localize } from '../../../../nls.js';

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

import { INotificationService } from '../../../../platform/notification/common/notification.js';

import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';

import { DROX_ENGINE_RESPAWN_SETTINGS } from '../common/droxRunSettings.js';

import { IDroxEngineService } from '../common/droxEngineService.js';



class DroxEngineConfigContribution extends Disposable implements IWorkbenchContribution {



	static readonly ID = 'workbench.contrib.droxEngineConfig';



	constructor(

		@IConfigurationService configurationService: IConfigurationService,

		@IDroxEngineService private readonly droxEngineService: IDroxEngineService,

		@INotificationService private readonly notificationService: INotificationService,

	) {

		super();



		this._register(configurationService.onDidChangeConfiguration(e => {

			if (!this.droxEngineService.isStarted) {

				return;

			}

			const needsRespawn = DROX_ENGINE_RESPAWN_SETTINGS.some(key => e.affectsConfiguration(key));

			if (!needsRespawn) {

				return;

			}

			void this.respawnEngine();

		}));

	}



	private async respawnEngine(): Promise<void> {

		this.notificationService.info(localize(

			'drox.engineRespawn',

			'Drox engine settings changed. Restarting the engine for the new configuration to take effect.',

		));

		await this.droxEngineService.dispose();

	}

}



registerWorkbenchContribution2(

	DroxEngineConfigContribution.ID,

	DroxEngineConfigContribution,

	WorkbenchPhase.Eventually,

);


