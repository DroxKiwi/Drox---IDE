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
import { IDroxSdtcmPause, parseDroxSdtcmPause } from '../../common/sdtcm/droxSdtcmPause.js';
import { normalizeDroxSdtcmMapRoot } from '../../common/sdtcm/droxSdtcmMapRoot.js';
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

export async function readDroxSdtcmPause(fileService: IFileService, root: URI): Promise<IDroxSdtcmPause | undefined> {
	const raw = await readText(fileService, URI.joinPath(root, '.drox', 'sdtcm', 'pause.json'));
	return raw === undefined ? undefined : parseDroxSdtcmPause(raw);
}

export async function writeDroxSdtcmPause(fileService: IFileService, root: URI, pause: IDroxSdtcmPause): Promise<void> {
	const dir = URI.joinPath(root, '.drox', 'sdtcm');
	await fileService.createFolder(dir);
	await fileService.writeFile(URI.joinPath(dir, 'pause.json'), VSBuffer.fromString(`${JSON.stringify(pause, null, 2)}\n`));
}

export async function deleteDroxSdtcmPause(fileService: IFileService, root: URI): Promise<void> {
	try {
		await fileService.del(URI.joinPath(root, '.drox', 'sdtcm', 'pause.json'));
	} catch {
		return;
	}
}

export async function writeDroxSdtcmStore(fileService: IFileService, root: URI, map: IDroxSdtcmMap, baseline: IDroxSdtcmBaseline): Promise<void> {
	const dir = URI.joinPath(root, '.drox', 'sdtcm');
	await fileService.createFolder(dir);
	await fileService.writeFile(URI.joinPath(dir, 'map.json'), VSBuffer.fromString(`${JSON.stringify(map, null, 2)}\n`));
	await fileService.writeFile(URI.joinPath(dir, 'baseline.json'), VSBuffer.fromString(`${JSON.stringify(baseline)}\n`));
}

export async function readDroxSdtcmMapRoot(fileService: IFileService, root: URI): Promise<string> {
	const raw = await readText(fileService, URI.joinPath(root, '.drox', 'sdtcm', 'root.txt'));
	if (raw === undefined) {
		return '';
	}
	return normalizeDroxSdtcmMapRoot(raw.split(/\r?\n/, 1)[0] ?? '') ?? '';
}

export async function writeDroxSdtcmMapRoot(fileService: IFileService, root: URI, mapRoot: string): Promise<void> {
	const uri = URI.joinPath(root, '.drox', 'sdtcm', 'root.txt');
	if (!mapRoot) {
		try {
			await fileService.del(uri);
		} catch {
			return;
		}
		return;
	}
	const dir = URI.joinPath(root, '.drox', 'sdtcm');
	await fileService.createFolder(dir);
	await fileService.writeFile(uri, VSBuffer.fromString(`${mapRoot}\n`));
}

/** Source files under `mapRoot`. Empty `mapRoot` is the whole folder. Ignored names and non-source extensions stay out. */
export async function listDroxSdtcmSources(fileService: IFileService, root: URI, mapRoot = ''): Promise<string[]> {
	const relative = normalizeDroxSdtcmMapRoot(mapRoot) ?? '';
	const patterns = parseDroxSdtcmIgnore(await ensureDroxSdtcmIgnore(fileService, root));
	const start = relative ? URI.joinPath(root, ...relative.split('/')) : root;
	const files: string[] = [];
	await walk(fileService, start, relative, files, patterns);
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

async function walk(fileService: IFileService, uri: URI, prefix: string, files: string[], patterns: readonly string[]): Promise<void> {
	const pending: { uri: URI; prefix: string }[] = [{ uri, prefix }];
	while (pending.length) {
		const current = pending.pop();
		if (!current) {
			return;
		}
		let stat;
		try {
			stat = await fileService.resolve(current.uri);
		} catch {
			continue;
		}
		const nested: { uri: URI; prefix: string }[] = [];
		for (const child of stat.children ?? []) {
			const rel = current.prefix ? `${current.prefix}/${child.name}` : child.name;
			if (droxSdtcmPathIgnored(rel, patterns)) {
				continue;
			}
			if (child.isDirectory) {
				nested.push({ uri: child.resource, prefix: rel });
				continue;
			}
			const ext = child.name.includes('.') ? child.name.split('.').pop() ?? '' : '';
			if (!SOURCE.has(ext)) {
				continue;
			}
			files.push(rel);
		}
		for (let index = nested.length - 1; index >= 0; index--) {
			const next = nested[index];
			if (next) {
				pending.push(next);
			}
		}
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
