/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { getDroxSessionsProviderInstance } from '../../../../../sessions/contrib/providers/drox/browser/droxSessionsProviderAccessor.js';
import { IDroxSessionChangesBridge } from '../../common/droxSessionChangesBridge.js';
import { IDroxSessionChangesDetailService } from '../../common/droxSessionChangesDetailService.js';

/**
 * IDE: mirror agent file-change events into the detail store when Agents
 * `DroxSessionsProvider` is not present in this process.
 */
class DroxIdeSessionChangesBridgeContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxIdeSessionChangesBridge';

	constructor(
		@IDroxSessionChangesBridge bridge: IDroxSessionChangesBridge,
		@IDroxSessionChangesDetailService detailService: IDroxSessionChangesDetailService,
	) {
		super();
		this._register(bridge.onDidApplyFileChange(e => {
			if (getDroxSessionsProviderInstance()) {
				return;
			}
			if (!e.change.applied) {
				return;
			}
			detailService.appendFileChange(e.sessionResource, e.change);
		}));
	}
}

registerWorkbenchContribution2(
	DroxIdeSessionChangesBridgeContribution.ID,
	DroxIdeSessionChangesBridgeContribution,
	WorkbenchPhase.AfterRestored,
);
