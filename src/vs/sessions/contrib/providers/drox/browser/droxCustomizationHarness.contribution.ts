/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IPathService } from '../../../../../workbench/services/path/common/pathService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ICustomizationHarnessService } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { isDroxAgentsWindowEnabled } from '../../../../../workbench/contrib/drox/common/droxAgentsConfiguration.js';
import { DroxSetting } from '../../../../../workbench/contrib/drox/common/droxConfiguration.js';
import { createDroxHarnessDescriptor } from './droxCustomizationHarness.js';

class DroxCustomizationHarnessContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.droxCustomizationHarness';

	private readonly _harnessRegistration = this._register(new MutableDisposable());

	constructor(
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IPathService private readonly pathService: IPathService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		if (!isDroxAgentsWindowEnabled(this.configurationService)) {
			return;
		}

		void this._refreshHarness();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(DroxSetting.RulesEnabled) || e.affectsConfiguration('drox.agentsWindow.enabled')) {
				if (!isDroxAgentsWindowEnabled(this.configurationService)) {
					this._harnessRegistration.clear();
					return;
				}
				void this._refreshHarness();
			}
		}));
	}

	private async _refreshHarness(): Promise<void> {
		const userHome = await this.pathService.userHome();
		const rulesEnabled = this.configurationService.getValue<boolean>(DroxSetting.RulesEnabled) !== false;
		const descriptor = createDroxHarnessDescriptor(userHome, { rulesEnabled });
		this._harnessRegistration.value = this.customizationHarnessService.registerExternalHarness(descriptor);
	}
}

registerWorkbenchContribution2(
	DroxCustomizationHarnessContribution.ID,
	DroxCustomizationHarnessContribution,
	WorkbenchPhase.AfterRestored,
);
