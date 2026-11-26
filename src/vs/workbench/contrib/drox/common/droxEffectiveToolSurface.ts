/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DroxEngineProfileId } from './droxEngineProfile.js';
import { droxEngineProfileAllowsTool } from './droxEngineProfileTools.js';
import { DROX_ALWAYS_ACTIVE_TOOLS, getDisabledToolNames } from './droxToolCatalog.js';
import { DROX_TOGGLEABLE_TOOL_NAMES } from './droxToolGroups.js';
import { applyDroxRegulationL2DisabledTools } from './regulation/droxRegulationL2Surface.js';
import { DroxRegulationL2Module } from './regulation/droxRegulationTypes.js';

export type DroxToolBlockReason = 'profile' | 'l2' | 'user' | 'family';

export interface IDroxEffectiveToolSurfaceInput {
	readonly engineProfile: DroxEngineProfileId;
	readonly l2Module: DroxRegulationL2Module;
	readonly customEnabledTools?: readonly string[];
	readonly userDisabled?: readonly string[];
	readonly memoryEnabled?: boolean;
	readonly subagentsMasterEnabled?: boolean;
}

export interface IDroxEffectiveToolSurface {
	readonly disabledTools: string[];
	readonly enabledForSchema: string[];
	readonly blocked: ReadonlyMap<string, DroxToolBlockReason>;
}

const MEMORY_FAMILY_TOOLS = ['memory_read', 'memory_list', 'session_note', 'session_search'] as const;

export function computeDroxEffectiveToolSurface(input: IDroxEffectiveToolSurfaceInput): IDroxEffectiveToolSurface {
	const userDisabled = getDisabledToolNames(input.userDisabled ?? []);
	const blocked = new Map<string, DroxToolBlockReason>();

	for (const name of DROX_TOGGLEABLE_TOOL_NAMES) {
		if (!droxEngineProfileAllowsTool(input.engineProfile, name)) {
			blocked.set(name, 'profile');
		}
	}

	for (const name of userDisabled) {
		if (!blocked.has(name)) {
			blocked.set(name, 'user');
		}
	}

	if (input.memoryEnabled !== true) {
		for (const name of MEMORY_FAMILY_TOOLS) {
			if (!blocked.has(name)) {
				blocked.set(name, 'family');
			}
		}
	}

	let disabled = new Set<string>();
	for (const name of [...userDisabled, ...blocked.keys()]) {
		disabled.add(name);
	}

	if (input.l2Module === 'custom' && input.customEnabledTools) {
		const enabled = new Set(input.customEnabledTools);
		for (const name of DROX_TOGGLEABLE_TOOL_NAMES) {
			if (!enabled.has(name)) {
				disabled.add(name);
				if (!blocked.has(name)) {
					blocked.set(name, 'l2');
				}
			}
		}
	} else if (input.l2Module !== 'custom') {
		const merged = applyDroxRegulationL2DisabledTools(input.l2Module, [...disabled]);
		disabled = new Set(merged);
		for (const name of merged) {
			if (!blocked.has(name) && !userDisabled.has(name) && droxEngineProfileAllowsTool(input.engineProfile, name)) {
				if (input.memoryEnabled !== true && (MEMORY_FAMILY_TOOLS as readonly string[]).includes(name)) {
					continue;
				}
				blocked.set(name, 'l2');
			}
		}
	}

	const always = new Set<string>(DROX_ALWAYS_ACTIVE_TOOLS);
	for (const name of always) {
		disabled.delete(name);
	}

	const disabledTools = [...disabled].sort();
	const enabledForSchema = DROX_TOGGLEABLE_TOOL_NAMES.filter(
		name => !disabled.has(name) && droxEngineProfileAllowsTool(input.engineProfile, name),
	);

	return { disabledTools, enabledForSchema, blocked };
}