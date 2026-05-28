/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { Extensions as OutputExtensions, IOutputChannelRegistry } from '../../../services/output/common/output.js';
import { DROX_OUTPUT_CHANNEL_ID } from '../common/droxIpc.js';
import { IDroxEngineService } from '../common/droxEngineService.js';
import { DROX_BASH_OUTPUT_CHANNEL_ID } from '../common/droxBash.js';
import { DROX_UI_OUTPUT_CHANNEL_ID } from '../common/droxUiLog.js';

Registry.as<IOutputChannelRegistry>(OutputExtensions.OutputChannels).registerChannel({
	id: DROX_OUTPUT_CHANNEL_ID,
	label: localize('droxEngineOutput', 'Drox (engine)'),
	log: false,
});

Registry.as<IOutputChannelRegistry>(OutputExtensions.OutputChannels).registerChannel({
	id: DROX_BASH_OUTPUT_CHANNEL_ID,
	label: localize('droxBashOutput', 'Drox (bash)'),
	log: false,
});

Registry.as<IOutputChannelRegistry>(OutputExtensions.OutputChannels).registerChannel({
	id: DROX_UI_OUTPUT_CHANNEL_ID,
	label: localize('droxUiOutput', 'Drox (UI)'),
	log: true,
});

class DroxEngineLifecycleContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxEngineLifecycle';

	constructor(
		@ILifecycleService lifecycleService: ILifecycleService,
		@IDroxEngineService private readonly droxEngineService: IDroxEngineService,
	) {
		super();
		this._register(lifecycleService.onWillShutdown(e => {
			e.join(this.droxEngineService.dispose(), {
				id: 'drox.engine.dispose',
				label: localize('droxShutdown', 'Shutting down Drox engine'),
			});
		}));
	}
}

registerWorkbenchContribution2(
	DroxEngineLifecycleContribution.ID,
	DroxEngineLifecycleContribution,
	WorkbenchPhase.Eventually,
);
