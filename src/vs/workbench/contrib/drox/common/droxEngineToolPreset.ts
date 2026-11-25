/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DroxEngineProfileId } from './droxEngineProfile.js';
import { droxEngineProfileAllowsTool } from './droxEngineProfileTools.js';
import { DROX_TOGGLEABLE_TOOL_NAMES } from './droxToolGroups.js';
import { droxRegulationL2AllowedToggleableTools } from './regulation/droxRegulationL2Surface.js';
import { DroxRegulationL2Module } from './regulation/droxRegulationTypes.js';

/** Default L2 module when regulation L2 is reset from an engine profile change. */
export function droxDefaultL2ModuleForEngineProfile(profile: DroxEngineProfileId): DroxRegulationL2Module {
	switch (profile) {
		case 'cloud-full':
			return 'full';
		case 'local-9b':
		case 'local-27b':
		default:
			return 'standard';
	}
}

/** Initial enabled toggleables when entering custom from a profile baseline. */
export function droxPresetEnabledToggleableTools(
	profile: DroxEngineProfileId,
	l2Module: DroxRegulationL2Module = droxDefaultL2ModuleForEngineProfile(profile),
): string[] {
	const allowedL2 = droxRegulationL2AllowedToggleableTools(l2Module);
	return DROX_TOGGLEABLE_TOOL_NAMES.filter(name => {
		if (!droxEngineProfileAllowsTool(profile, name)) {
			return false;
		}
		if (allowedL2 && !allowedL2.has(name)) {
			return false;
		}
		return true;
	});
}