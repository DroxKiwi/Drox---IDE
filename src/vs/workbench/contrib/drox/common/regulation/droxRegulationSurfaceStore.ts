/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import {
	createDefaultRegulationSurfaceState,
	DROX_REGULATION_DEFAULT_MODULES,
	DROX_REGULATION_LEVER_IDS,
	DROX_REGULATION_MODULES_FOR_LEVER,
	DroxRegulationLeverId,
	DroxRegulationLeverMode,
	DroxRegulationModule,
	DroxRegulationModulesByLever,
	DroxRegulationSurfaceState,
	IDroxRegulationLeverState,
} from './droxRegulationTypes.js';
import { droxRegulationDir, droxRegulationSurfacePath } from './droxRegulationPaths.js';

export const DROX_REGULATION_SURFACE_SCHEMA = 1;

export interface IDroxRegulationSurfaceFile {
	readonly schema: number;
	readonly levers: DroxRegulationSurfaceState;
}

function isMode(v: unknown): v is DroxRegulationLeverMode {
	return v === 'auto' || v === 'manual';
}

function isModuleForLever(lever: DroxRegulationLeverId, mod: unknown): mod is DroxRegulationModule {
	if (typeof mod !== 'string') {
		return false;
	}
	return (DROX_REGULATION_MODULES_FOR_LEVER[lever] as readonly string[]).includes(mod);
}

export function parseDroxRegulationSurfaceFile(raw: string): DroxRegulationSurfaceState {
	const defaults = createDefaultRegulationSurfaceState();
	try {
		const parsed = JSON.parse(raw) as { levers?: unknown };
		if (!parsed.levers || typeof parsed.levers !== 'object') {
			return defaults;
		}
		const src = parsed.levers as Record<string, unknown>;
		const out = {} as Record<DroxRegulationLeverId, IDroxRegulationLeverState>;
		for (const lever of DROX_REGULATION_LEVER_IDS) {
			const row = src[lever];
			const obj = (row && typeof row === 'object') ? row as Record<string, unknown> : {};
			const mode = isMode(obj.mode) ? obj.mode : defaults[lever].mode;
			const module = isModuleForLever(lever, obj.module) ? obj.module : defaults[lever].module;
			out[lever] = { lever, mode, module };
		}
		return out;
	} catch {
		return defaults;
	}
}

export function serializeDroxRegulationSurfaceFile(state: DroxRegulationSurfaceState): string {
	const file: IDroxRegulationSurfaceFile = {
		schema: DROX_REGULATION_SURFACE_SCHEMA,
		levers: state,
	};
	return `${JSON.stringify(file, null, '\t')}\n`;
}

export async function droxRegulationReadSurface(
	fileService: IFileService,
	workspaceRootFsPath: string,
): Promise<DroxRegulationSurfaceState> {
	const uri = URI.file(droxRegulationSurfacePath(workspaceRootFsPath));
	if (!(await fileService.exists(uri))) {
		return createDefaultRegulationSurfaceState();
	}
	try {
		const raw = (await fileService.readFile(uri)).value.toString();
		return parseDroxRegulationSurfaceFile(raw);
	} catch {
		return createDefaultRegulationSurfaceState();
	}
}

export async function droxRegulationWriteSurface(
	fileService: IFileService,
	workspaceRootFsPath: string,
	state: DroxRegulationSurfaceState,
): Promise<void> {
	const dir = URI.file(droxRegulationDir(workspaceRootFsPath));
	await fileService.createFolder(dir);
	const uri = URI.file(droxRegulationSurfacePath(workspaceRootFsPath));
	await fileService.writeFile(uri, VSBuffer.fromString(serializeDroxRegulationSurfaceFile(state)));
}

export function droxRegulationModulesFromSurface(state: DroxRegulationSurfaceState): DroxRegulationModulesByLever {
	return {
		L1: state.L1.module as DroxRegulationModulesByLever['L1'],
		L2: state.L2.module as DroxRegulationModulesByLever['L2'],
		L3: state.L3.module as DroxRegulationModulesByLever['L3'],
		L4: state.L4.module as DroxRegulationModulesByLever['L4'],
		L5: state.L5.module as DroxRegulationModulesByLever['L5'],
	};
}

export function withLeverMode(
	state: DroxRegulationSurfaceState,
	lever: DroxRegulationLeverId,
	mode: DroxRegulationLeverMode,
): DroxRegulationSurfaceState {
	return {
		...state,
		[lever]: { ...state[lever], mode },
	};
}

export function withLeverModule(
	state: DroxRegulationSurfaceState,
	lever: DroxRegulationLeverId,
	module: DroxRegulationModule,
): DroxRegulationSurfaceState | undefined {
	if (!isModuleForLever(lever, module)) {
		return undefined;
	}
	return {
		...state,
		[lever]: {
			lever,
			mode: 'manual',
			module,
		},
	};
}

export { DROX_REGULATION_DEFAULT_MODULES };
