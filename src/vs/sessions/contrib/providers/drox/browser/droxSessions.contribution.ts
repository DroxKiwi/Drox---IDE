/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { isDroxAgentsWindowEnabled } from '../../../../../workbench/contrib/drox/common/droxAgentsConfiguration.js';
import { DroxSessionsProvider } from './droxSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';

class DroxSessionsProviderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.droxSessionsProvider';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		if (!isDroxAgentsWindowEnabled(configurationService)) {
			return;
		}

		const provider = this._register(instantiationService.createInstance(DroxSessionsProvider));
		this._register(sessionsProvidersService.registerProvider(provider));
	}
}

registerWorkbenchContribution2(
	DroxSessionsProviderContribution.ID,
	DroxSessionsProviderContribution,
	WorkbenchPhase.BlockRestore,
);
