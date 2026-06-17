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
import { DROX_DEFAULT_MAX_ITERATIONS, DROX_DEFAULT_NUM_CTX, DROX_DEFAULT_NUM_PREDICT } from './droxProductDefaults.js';

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

function createDroxDevAdvancedLlmProperties(): Record<string, IConfigurationPropertySchema> {
	if (!isDroxDevFeatureEnabled('advancedLlmSettings', product)) {
		return {};
	}
	return {
		[DroxSetting.MaxIterations]: {
			type: 'number',
			default: DROX_DEFAULT_MAX_ITERATIONS,
			minimum: 1,
			maximum: 200,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: devDescription(
				localize(
					'drox.maxIterations',
					'**Parent agent iterations** — maximum LLM ↔ tool turns per `agent.run` (Architect edit).',
				),
			),
		},
		[DroxSetting.Temperature]: {
			type: 'number',
			default: undefined,
			minimum: 0,
			maximum: 2,
			scope: ConfigurationScope.RESOURCE,
			description: devDescription(localize('drox.temperature', 'Sampling temperature. Leave unset for server default.')),
		},
		[DroxSetting.MaxTokens]: {
			type: 'number',
			default: undefined,
			minimum: 1,
			scope: ConfigurationScope.RESOURCE,
			description: devDescription(localize('drox.maxTokens', 'Max response tokens per turn.')),
		},
		[DroxSetting.NumPredict]: {
			type: 'number',
			default: DROX_DEFAULT_NUM_PREDICT,
			minimum: 1,
			maximum: 65536,
			scope: ConfigurationScope.RESOURCE,
			description: devDescription(localize('drox.numPredict', 'Ollama `num_predict` (generated tokens cap).')),
		},
		[DroxSetting.NumCtx]: {
			type: 'number',
			default: DROX_DEFAULT_NUM_CTX,
			minimum: 2048,
			maximum: 200000,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: devDescription(
				localize(
					'drox.numCtx',
					'**Context window** — Ollama `num_ctx` for the Architect run.',
				),
			),
		},
		[DroxSetting.TopP]: {
			type: 'number',
			default: undefined,
			minimum: 0,
			maximum: 1,
			scope: ConfigurationScope.RESOURCE,
			description: devDescription(localize('drox.topP', 'Ollama `top_p`.')),
		},
		[DroxSetting.TopK]: {
			type: 'number',
			default: undefined,
			minimum: 1,
			maximum: 200,
			scope: ConfigurationScope.RESOURCE,
			description: devDescription(localize('drox.topK', 'Ollama `top_k`.')),
		},
		[DroxSetting.RepeatPenalty]: {
			type: 'number',
			default: undefined,
			minimum: 0.5,
			maximum: 2,
			scope: ConfigurationScope.RESOURCE,
			description: devDescription(localize('drox.repeatPenalty', 'Ollama `repeat_penalty`.')),
		},
		[DroxSetting.Seed]: {
			type: 'number',
			default: undefined,
			scope: ConfigurationScope.RESOURCE,
			description: devDescription(localize('drox.seed', 'Ollama `seed` for reproducible sampling.')),
		},
		[DroxSetting.MinP]: {
			type: 'number',
			default: undefined,
			minimum: 0,
			maximum: 1,
			scope: ConfigurationScope.RESOURCE,
			description: devDescription(localize('drox.minP', 'Ollama `min_p`.')),
		},
		[DroxSetting.PresencePenalty]: {
			type: 'number',
			default: undefined,
			minimum: -2,
			maximum: 2,
			scope: ConfigurationScope.RESOURCE,
			description: devDescription(localize('drox.presencePenalty', 'Ollama `presence_penalty`.')),
		},
		[DroxSetting.FrequencyPenalty]: {
			type: 'number',
			default: undefined,
			minimum: -2,
			maximum: 2,
			scope: ConfigurationScope.RESOURCE,
			description: devDescription(localize('drox.frequencyPenalty', 'Ollama `frequency_penalty`.')),
		},
		[DroxSetting.KeepAlive]: {
			type: 'string',
			default: '',
			scope: ConfigurationScope.RESOURCE,
			description: devDescription(localize('drox.keepAlive', 'Ollama `keep_alive` (e.g. `30m`, `0`, `-1`).')),
		},
	};
}

/** Clés Settings enregistrées uniquement en surface `dev` (F5 / dogfood). */
export function createDroxDevConfigurationProperties(): Record<string, IConfigurationPropertySchema> {
	return {
		...createDroxDevExecutablePathProperty(),
		...createDroxDevAdvancedLlmProperties(),
		...createDroxDevUpdateSimulateProperties(),
	};
}
