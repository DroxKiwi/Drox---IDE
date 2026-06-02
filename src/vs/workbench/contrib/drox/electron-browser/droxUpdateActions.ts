/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IDroxUpdateService } from '../common/droxUpdateService.js';

const DROX_CATEGORY = localize2('drox.category', 'Drox');

export const DroxUpdateCommands = {
	CheckForUpdates: 'workbench.action.droxCheckForUpdates',
} as const;

export function registerDroxUpdateActions(): void {
	registerAction2(class DroxCheckForUpdatesAction extends Action2 {
		constructor() {
			super({
				id: DroxUpdateCommands.CheckForUpdates,
				title: localize2('drox.checkForUpdates', 'Drox: Check for Updates'),
				category: DROX_CATEGORY,
				f1: true,
			});
		}

		override async run(accessor: ServicesAccessor): Promise<void> {
			const updateService = accessor.get(IDroxUpdateService);
			await updateService.checkForUpdates({ ignoreDismissed: true, notifyIfUpToDate: true });
		}
	});
}
