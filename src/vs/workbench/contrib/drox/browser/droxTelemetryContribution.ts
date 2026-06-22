/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ConfigurationTarget, IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import {
	TELEMETRY_CRASH_REPORTER_SETTING_ID,
	TELEMETRY_OLD_SETTING_ID,
	TELEMETRY_SETTING_ID,
	TelemetryConfiguration,
} from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
/**
 * D1.5 — Opt-out total de la télémétrie Microsoft (niveau produit + réglages utilisateur).
 * L'issue reporter Drox reste disponible via `telemetry.feedback.enabled` (défaut upstream).
 */
class DroxTelemetryContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.droxTelemetry';
	constructor(
		@IConfigurationService configurationService: IConfigurationService,
	) {
		const apply = (key: string, value: unknown) => {
			configurationService.updateValue(key, value, ConfigurationTarget.APPLICATION);
		};
		apply(TELEMETRY_SETTING_ID, TelemetryConfiguration.OFF);
		apply(TELEMETRY_OLD_SETTING_ID, false);
		apply(TELEMETRY_CRASH_REPORTER_SETTING_ID, false);
	}
}
registerWorkbenchContribution2(
	DroxTelemetryContribution.ID,
	DroxTelemetryContribution,
	WorkbenchPhase.BlockRestore,
);
