/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { localize, localize2 } from '../../../../../nls.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { DroxCommands } from '../../common/drox.js';
import { IDroxClientToolsService } from '../../common/droxClientToolsService.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';
import { IDroxUserAskService } from '../../common/droxUserAskService.js';

const DROX_CATEGORY = localize2('drox.category', 'Drox');

/**
 * Skip a stuck `bash` tool without cancelling the agent run.
 * IDE: Ctrl+C on shared agent terminal · Agents: kill main-process ExecBash.
 */
export function registerDroxAgentsSkipShellActions(): void {
	registerAction2(class DroxSkipStuckShellAction extends Action2 {
		constructor() {
			super({
				id: DroxCommands.SkipStuckShell,
				title: localize2('drox.skipStuckShell', 'Skip Stuck Shell Command'),
				category: DROX_CATEGORY,
				f1: true,
			});
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const clientTools = accessor.get(IDroxClientToolsService);
			const userAsk = accessor.get(IDroxUserAskService);
			const engine = accessor.get(IDroxEngineService);
			const notification = accessor.get(INotificationService);
			const log = accessor.get(ILogService);
			// A permission dialog holds the run before the process exists.
			const cancelledAsk = userAsk.cancelPendingForCommandStop();
			const skipped = await clientTools.skipActiveBash();
			if (cancelledAsk) {
				// The dialog denial is this click. Do not also skip the next command.
				try {
					await engine.request('tools.clearBashSkip', {});
				} catch (e) {
					log.info(`[Drox] tools.clearBashSkip: ${e instanceof Error ? e.message : String(e)}`);
				}
			}
			if (skipped || cancelledAsk) {
				log.info('[Drox] skipStuckShell: command stop requested');
				notification.info(localize(
					'drox.skipStuckShell.ok',
					'Command stopped. The model continues and knows you forced the stop.',
				));
			} else {
				log.info('[Drox] skipStuckShell: no active bash');
				notification.info(localize(
					'drox.skipStuckShell.none',
					'No shell command is running.',
				));
			}
		}
	});
}
