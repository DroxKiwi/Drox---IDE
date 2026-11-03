/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import {
	DROX_SDTCM_IGNORE_DEFAULT,
	DROX_SDTCM_IGNORE_FILE,
	droxSdtcmPathIgnored,
	parseDroxSdtcmIgnore,
} from '../../common/sdtcm/droxSdtcmIgnore.js';
import {
	emptyDroxSdtcmBaseline,
	emptyDroxSdtcmMap,
	IDroxSdtcmBaseline,
	IDroxSdtcmMap,
	parseDroxSdtcmBaseline,
	parseDroxSdtcmMap,
} from '../../common/sdtcm/droxSdtcmMap.js';
import { IDroxSdtcmSavedDisplay, parseDroxSdtcmDisplay } from '../../common/sdtcm/droxSdtcmDisplay.js';
import { IDroxSdtcmTag, parseDroxSdtcmTags } from '../../common/sdtcm/droxSdtcmRole.js';

const SOURCE = new Set(['py', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'go', 'rs', 'java', 'kt', 'cs', 'php', 'rb', 'c', 'h', 'cc', 'cpp', 'hpp', 'vue', 'svelte', 'html', 'css', 'scss', 'json', 'yml', 'yaml', 'toml', 'sh', 'ps1', 'sql']);

export async function readDroxSdtcmStore(fileService: IFileService, root: URI): Promise<{ map: IDroxSdtcmMap; baseline: IDroxSdtcmBaseline }> {
	const map = await readText(fileService, URI.joinPath(root, '.drox', 'sdtcm', 'map.json'));
	const baseline = await readText(fileService, URI.joinPath(root, '.drox', 'sdtcm', 'baseline.json'));
	return {
		map: map === undefined ? emptyDroxSdtcmMap() : parseDroxSdtcmMap(map),
		baseline: baseline === undefined ? emptyDroxSdtcmBaseline() : parseDroxSdtcmBaseline(baseline),
	};
}

export async function readDroxSdtcmTags(fileService: IFileService, root: URI): Promise<IDroxSdtcmTag[]> {
	const raw = await readText(fileService, URI.joinPath(root, '.drox', 'sdtcm', 'tags.json'));
	return raw === undefined ? [] : parseDroxSdtcmTags(raw);
}

export async function readDroxSdtcmDisplay(fileService: IFileService, root: URI): Promise<IDroxSdtcmSavedDisplay | undefined> {
	const raw = await readText(fileService, URI.joinPath(root, '.drox', 'sdtcm', 'display.json'));
	return raw === undefined ? undefined : parseDroxSdtcmDisplay(raw);
}

export async function writeDroxSdtcmDisplay(fileService: IFileService, root: URI, display: IDroxSdtcmSavedDisplay): Promise<void> {
	const dir = URI.joinPath(root, '.drox', 'sdtcm');
	await fileService.createFolder(dir);
	await fileService.writeFile(URI.joinPath(dir, 'display.json'), VSBuffer.fromString(`${JSON.stringify(display, null, 2)}\n`));
}

export async function writeDroxSdtcmTags(fileService: IFileService, root: URI, tags: readonly IDroxSdtcmTag[]): Promise<void> {
	const dir = URI.joinPath(root, '.drox', 'sdtcm');
	await fileService.createFolder(dir);
	await fileService.writeFile(URI.joinPath(dir, 'tags.json'), VSBuffer.fromString(`${JSON.stringify(tags, null, 2)}\n`));
}

export async function writeDroxSdtcmStore(fileService: IFileService, root: URI, map: IDroxSdtcmMap, baseline: IDroxSdtcmBaseline): Promise<void> {
	const dir = URI.joinPath(root, '.drox', 'sdtcm');
	await fileService.createFolder(dir);
	await fileService.writeFile(URI.joinPath(dir, 'map.json'), VSBuffer.fromString(`${JSON.stringify(map, null, 2)}\n`));
	await fileService.writeFile(URI.joinPath(dir, 'baseline.json'), VSBuffer.fromString(`${JSON.stringify(baseline)}\n`));
}

export async function listDroxSdtcmSources(fileService: IFileService, root: URI): Promise<string[]> {
	const patterns = parseDroxSdtcmIgnore(await ensureDroxSdtcmIgnore(fileService, root));
	const files: string[] = [];
	await walk(fileService, root, '', files, 0, patterns);
	return files;
}

async function ensureDroxSdtcmIgnore(fileService: IFileService, root: URI): Promise<string> {
	const uri = URI.joinPath(root, '.drox', DROX_SDTCM_IGNORE_FILE);
	const existing = await readText(fileService, uri);
	if (existing !== undefined) {
		return existing;
	}
	await fileService.createFolder(URI.joinPath(root, '.drox'));
	await fileService.writeFile(uri, VSBuffer.fromString(DROX_SDTCM_IGNORE_DEFAULT));
	return DROX_SDTCM_IGNORE_DEFAULT;
}

export async function readDroxSdtcmText(fileService: IFileService, root: URI, relativePath: string): Promise<string | undefined> {
	return readText(fileService, URI.joinPath(root, ...relativePath.split('/')));
}

async function walk(fileService: IFileService, uri: URI, prefix: string, files: string[], depth: number, patterns: readonly string[]): Promise<void> {
	if (files.length >= 120 || depth > 12) {
		return;
	}
	let stat;
	try {
		stat = await fileService.resolve(uri);
	} catch {
		return;
	}
	for (const child of stat.children ?? []) {
		if (files.length >= 120) {
			return;
		}
		const rel = prefix ? `${prefix}/${child.name}` : child.name;
		if (droxSdtcmPathIgnored(rel, patterns)) {
			continue;
		}
		if (child.isDirectory) {
			await walk(fileService, child.resource, rel, files, depth + 1, patterns);
			continue;
		}
		const ext = child.name.includes('.') ? child.name.split('.').pop() ?? '' : '';
		if (!SOURCE.has(ext)) {
			continue;
		}
		files.push(rel);
	}
}

async function readText(fileService: IFileService, uri: URI): Promise<string | undefined> {
	try {
		const file = await fileService.readFile(uri);
		return file.value.toString();
	} catch {
		return undefined;
	}
}
