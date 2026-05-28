/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IDroxLlmModelsService } from '../common/droxLlmModelsService.js';

class DroxLlmModelsContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxLlmModels';

	constructor(
		@IDroxLlmModelsService llmModelsService: IDroxLlmModelsService,
	) {
		void llmModelsService.refresh();
	}
}

registerWorkbenchContribution2(
	DroxLlmModelsContribution.ID,
	DroxLlmModelsContribution,
	WorkbenchPhase.Eventually,
);
