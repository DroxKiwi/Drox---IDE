/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const DROX_ENGINE_PROFILE_DEFAULT = 'local-9b' as const;

export const DROX_ENGINE_PROFILES = ['local-9b', 'local-27b', 'cloud-full'] as const;

export type DroxEngineProfileId = (typeof DROX_ENGINE_PROFILES)[number];

export function isDroxEngineProfileId(value: unknown): value is DroxEngineProfileId {
	return value === 'local-9b' || value === 'local-27b' || value === 'cloud-full';
}

/** Unknown / empty → default small-model profile. */
export function normalizeDroxEngineProfile(raw: unknown): DroxEngineProfileId {
	return isDroxEngineProfileId(raw) ? raw : DROX_ENGINE_PROFILE_DEFAULT;
}
