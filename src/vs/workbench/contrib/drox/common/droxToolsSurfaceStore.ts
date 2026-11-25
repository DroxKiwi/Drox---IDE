/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { join } from '../../../../base/common/path.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { DROX_TOGGLEABLE_TOOL_NAMES } from './droxToolGroups.js';
import { droxToolsSurfacePath } from './droxToolsSurfacePaths.js';

export function droxToolsSurfaceDir(workspaceRootFsPath: string): string {
	return join(workspaceRootFsPath, '.drox');
}

export const DROX_TOOLS_SURFACE_SCHEMA = 1;

export interface IDroxToolsSurfaceFile {
	readonly schema: number;
	readonly customActive: boolean;
	readonly enabled: readonly string[];
}

export interface IDroxToolsSurfaceState {
	readonly customActive: boolean;
	readonly enabled: readonly string[];
}

function emptyState(): IDroxToolsSurfaceState {
	return { customActive: false, enabled: [] };
}

function normalizeEnabled(enabled: unknown): string[] {
	if (!Array.isArray(enabled)) {
		return [];
	}
	const ok = new Set(DROX_TOGGLEABLE_TOOL_NAMES);
	return enabled
		.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
		.map(n => n.trim())
		.filter(n => ok.has(n));
}

export function parseDroxToolsSurfaceFile(raw: string): IDroxToolsSurfaceState {
	try {
		const parsed = JSON.parse(raw) as Partial<IDroxToolsSurfaceFile>;
		const customActive = parsed.customActive === true;
		const enabled = normalizeEnabled(parsed.enabled);
		if (!customActive) {
			return emptyState();
		}
		return { customActive: true, enabled };
	} catch {
		return emptyState();
	}
}

export function serializeDroxToolsSurfaceFile(state: IDroxToolsSurfaceState): string {
	const file: IDroxToolsSurfaceFile = {
		schema: DROX_TOOLS_SURFACE_SCHEMA,
		customActive: state.customActive,
		enabled: [...state.enabled],
	};
	return `${JSON.stringify(file, null, '\t')}\n`;
}

export async function droxToolsSurfaceRead(
	fileService: IFileService,
	workspaceRootFsPath: string,
): Promise<IDroxToolsSurfaceState> {
	const uri = URI.file(droxToolsSurfacePath(workspaceRootFsPath));
	if (!(await fileService.exists(uri))) {
		return emptyState();
	}
	try {
		const raw = (await fileService.readFile(uri)).value.toString();
		return parseDroxToolsSurfaceFile(raw);
	} catch {
		return emptyState();
	}
}

export async function droxToolsSurfaceWrite(
	fileService: IFileService,
	workspaceRootFsPath: string,
	state: IDroxToolsSurfaceState,
): Promise<void> {
	const uri = URI.file(droxToolsSurfacePath(workspaceRootFsPath));
	const parent = URI.file(droxToolsSurfaceDir(workspaceRootFsPath));
	if (!(await fileService.exists(parent))) {
		await fileService.createFolder(parent);
	}
	await fileService.writeFile(uri, VSBuffer.fromString(serializeDroxToolsSurfaceFile(state)));
}

export function isDroxCustomToolsSurfaceActive(state: IDroxToolsSurfaceState | undefined): boolean {
	return state?.customActive === true;
}