/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IPathService } from '../../../../../workbench/services/path/common/pathService.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ICustomizationHarnessService } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { isDroxAgentsWindowEnabled } from '../../../../../workbench/contrib/drox/common/droxAgentsConfiguration.js';
import { createDroxHarnessDescriptor } from './droxCustomizationHarness.js';

class DroxCustomizationHarnessContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.droxCustomizationHarness';

	constructor(
		@ICustomizationHarnessService private readonly customizationHarnessService: ICustomizationHarnessService,
		@IPathService private readonly pathService: IPathService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		if (!isDroxAgentsWindowEnabled(configurationService)) {
			return;
		}

		void this._registerHarness();
	}

	private async _registerHarness(): Promise<void> {
		const userHome = await this.pathService.userHome();
		const descriptor = createDroxHarnessDescriptor(userHome);
		this._register(this.customizationHarnessService.registerExternalHarness(descriptor));
	}
}

registerWorkbenchContribution2(
	DroxCustomizationHarnessContribution.ID,
	DroxCustomizationHarnessContribution,
	WorkbenchPhase.AfterRestored,
);
