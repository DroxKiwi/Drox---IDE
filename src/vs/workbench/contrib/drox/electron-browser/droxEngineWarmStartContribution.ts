/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow, runWhenWindowIdle } from '../../../../base/browser/dom.js';

import { Disposable } from '../../../../base/common/lifecycle.js';

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

import { ILogService } from '../../../../platform/log/common/log.js';

import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';

import { IDroxClientToolsService } from '../common/droxClientToolsService.js';

import { DroxSetting } from '../common/droxConfiguration.js';

import { IDroxEngineService } from '../common/droxEngineService.js';

import { IDroxRunSettingsService } from '../common/droxRunSettingsService.js';



/**

 * Pre-spawns `drox --serve` and completes the JSON-RPC `initialize` handshake

 * after the workbench is idle (I-37 warm start).

 */

class DroxEngineWarmStartContribution extends Disposable implements IWorkbenchContribution {



	static readonly ID = 'workbench.contrib.droxEngineWarmStart';



	private _warmInFlight = false;



	constructor(

		@IConfigurationService private readonly configurationService: IConfigurationService,

		@IDroxEngineService private readonly droxEngineService: IDroxEngineService,

		@IDroxClientToolsService private readonly clientToolsService: IDroxClientToolsService,

		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,

		@ILogService private readonly logService: ILogService,

	) {

		super();

		this._register(runWhenWindowIdle(getActiveWindow(), () => this.scheduleWarmStart()));

	}



	private scheduleWarmStart(): void {

		if (!this.isWarmStartEnabled()) {

			return;

		}

		if (this.droxEngineService.isInitialized || this._warmInFlight) {

			return;

		}

		this._warmInFlight = true;

		const t0 = Date.now();

		void this.warmStart()

			.then(() => {

				this.logService.trace(`[Drox] warm start OK (${Date.now() - t0} ms)`);

			})

			.catch(err => {

				this.logService.debug(`[Drox] warm start skipped or failed: ${err instanceof Error ? err.message : String(err)}`);

			})

			.finally(() => {

				this._warmInFlight = false;

			});

	}



	private isWarmStartEnabled(): boolean {

		return this.configurationService.getValue<boolean>(DroxSetting.WarmStart) !== false;

	}



	private async warmStart(): Promise<void> {

		const allTools = this.clientToolsService.executableToolNames;

		const executableTools = this.runSettingsService.filterExecutableTools(allTools);

		await this.droxEngineService.initialize({

			executableTools: [...executableTools],

			interactiveAsk: true,

		});

	}

}



registerWorkbenchContribution2(

	DroxEngineWarmStartContribution.ID,

	DroxEngineWarmStartContribution,

	WorkbenchPhase.AfterRestored,

);


