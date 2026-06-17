/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Legacy `drox.engine.strictness` — settings registry only; not sent on `agent.run`.
 * The engine uses a single product profile (`EngineTuning::product_default`).
 */

import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DroxSetting } from './droxConfiguration.js';

/** Valeurs acceptées dans les settings et côté moteur (`StrictnessPreset::parse`). */
export const DROX_ENGINE_STRICTNESS_PRESETS = ['relaxed', 'normal', 'strict', 'custom'] as const;

export type DroxEngineStrictnessPreset = (typeof DROX_ENGINE_STRICTNESS_PRESETS)[number];

/** Défaut produit — aligné `StrictnessPreset::Normal` / `PromptVars::default()`. */
export const DROX_DEFAULT_ENGINE_STRICTNESS: DroxEngineStrictnessPreset = 'normal';

const LEGACY_ALIASES: Record<string, DroxEngineStrictnessPreset> = {
	relax: 'relaxed',
	light: 'relaxed',
	default: 'normal',
	standard: 'normal',
	hard: 'strict',
	advanced: 'custom',
	manual: 'custom',
};

export function isValidDroxEngineStrictnessPreset(
	value: string,
): value is DroxEngineStrictnessPreset {
	return (DROX_ENGINE_STRICTNESS_PRESETS as readonly string[]).includes(value);
}

/** Normalise une valeur settings (ou legacy) vers un preset connu. */
export function normalizeDroxEngineStrictnessPreset(
	value: string | undefined,
): DroxEngineStrictnessPreset {
	if (!value) {
		return DROX_DEFAULT_ENGINE_STRICTNESS;
	}
	const raw = value.trim().toLowerCase();
	if (isValidDroxEngineStrictnessPreset(raw)) {
		return raw;
	}
	return LEGACY_ALIASES[raw] ?? DROX_DEFAULT_ENGINE_STRICTNESS;
}

/** Lit `drox.engine.strictness` pour un workspace (ou défaut global). */
export function readDroxEngineStrictness(
	configService: IConfigurationService,
	resource?: URI,
): DroxEngineStrictnessPreset {
	const v = configService.getValue<string>(DroxSetting.EngineStrictness, { resource });
	return normalizeDroxEngineStrictnessPreset(v);
}

/**
 * @deprecated No longer sent on `agent.run` — kept for legacy settings normalization.
 */
export function wireEngineStrictnessForRpc(
	preset: DroxEngineStrictnessPreset,
): string {
	return preset;
}
