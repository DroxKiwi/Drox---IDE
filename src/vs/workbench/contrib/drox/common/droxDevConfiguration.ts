/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file
import { localize } from '../../../../nls.js';

import { ConfigurationScope, IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';

import product from '../../../../platform/product/common/product.js';

import { DroxSetting } from './droxConfiguration.js';

import { isDroxDevFeatureEnabled } from './droxDevSurface.js';
const DEV_ONLY = localize(

	'drox.settings.devOnly',

	'**Dev / dogfood only** — hidden in release builds (`droxSurface: release`).',

);
function devDescription(body: string): string {

	return `${body}\n\n${DEV_ONLY}`;

}
function createDroxDevUpdateSimulateProperties(): Record<string, IConfigurationPropertySchema> {

	if (!isDroxDevFeatureEnabled('updateSimulateLatest', product)) {

		return {};

	}

	return {

		[DroxSetting.UpdateSimulateLatestVersion]: {

			type: 'string',

			default: '',

			scope: ConfigurationScope.APPLICATION,

			markdownDescription: localize(

				'drox.update.simulateLatestVersion',

				'**Dev/test:** if set (e.g. `99.0.0`), skips the remote manifest and uses this as the latest version. Use with **Drox: Check for Updates** to preview the update notification without publishing a release.',

			),

		},

		[DroxSetting.UpdateSimulateInstallerUrl]: {

			type: 'string',

			default: 'https://github.com/DroxKiwi/Drox---IDE---OR/releases/latest',

			scope: ConfigurationScope.APPLICATION,

			markdownDescription: localize(

				'drox.update.simulateInstallerUrl',

				'**Dev/test:** URL used when `drox.update.simulateLatestVersion` is set and you click **Installer maintenant**.',

			),

		},

	};

}
function createDroxDevExecutablePathProperty(): Record<string, IConfigurationPropertySchema> {

	if (!isDroxDevFeatureEnabled('executablePath', product)) {

		return {};

	}

	return {

		[DroxSetting.ExecutablePath]: {

			type: 'string',

			default: '',

			markdownDescription: devDescription(

				localize(

					'drox.executablePath',

					'Path to the `drox` executable. When empty, probes `drox-engine/drox/target/{debug,release}/` then `drox` on `PATH`.',

				),

			),

			scope: ConfigurationScope.MACHINE_OVERRIDABLE,

		},

	};

}
/** Clés Settings enregistrées uniquement en surface `dev` (F5 / dogfood). */

export function createDroxDevConfigurationProperties(): Record<string, IConfigurationPropertySchema> {

	return {

		...createDroxDevExecutablePathProperty(),

		...createDroxDevUpdateSimulateProperties(),

	};

}

