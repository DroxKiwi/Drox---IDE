/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { DroxSetting } from '../common/droxConfiguration.js';
import { IDroxUpdateService } from '../common/droxUpdateService.js';

class DroxUpdateNotificationContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxUpdateNotification';

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDroxUpdateService private readonly droxUpdateService: IDroxUpdateService,
	) {
		super();
		if (this.configurationService.getValue<boolean>(DroxSetting.UpdateNotifyOnStartup) === false) {
			return;
		}
		void this.droxUpdateService.checkForUpdates();
	}
}

registerWorkbenchContribution2(
	DroxUpdateNotificationContribution.ID,
	DroxUpdateNotificationContribution,
	WorkbenchPhase.AfterRestored,
);
