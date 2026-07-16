/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, dirname, isAbsolute, join, normalize, relative } from '../../../../../base/common/path.js';
import { isEqualOrParent } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { normalizeWindowsFsPath } from '../../common/droxPathUtil.js';

export { languageIdForFile } from '../../common/droxFileLanguage.js';

async function canonicalFsPath(fileService: IFileService, uri: URI): Promise<string> {
	const canon = await fileService.realpath(uri) ?? uri;
	return normalizeWindowsFsPath(canon.fsPath);
}

export async function resolvePathForWrite(
	fileService: IFileService,
	workspaceRoot: string,
	userPath: string,
	allowOutsideWorkspace = false,
): Promise<string> {
	const trimmed = normalizeWindowsFsPath(userPath.trim());
	if (!trimmed) {
		throw new Error('path must not be empty');
	}
	const wsRoot = normalizeWindowsFsPath(workspaceRoot);
	const joined = isAbsolute(trimmed)
		? normalize(trimmed)
		: normalize(join(wsRoot, trimmed));

	const fileName = basename(joined);
	if (!fileName || fileName === '.' || fileName === '..') {
		throw new Error('path must include a file name');
	}

	const parentUri = URI.file(dirname(joined));
	const targetUri = URI.file(joined);

	const relFromRoot = relative(wsRoot, joined);
	if (!allowOutsideWorkspace && (!relFromRoot || relFromRoot.startsWith('..') || isAbsolute(relFromRoot))) {
		throw new Error('path escapes workspace');
	}

	const parentExists = await fileService.exists(parentUri);
	if (!parentExists) {
		return normalize(joined);
	}

	const parentFs = await canonicalFsPath(fileService, parentUri);
	const parentCanon = URI.file(parentFs);

	if (!allowOutsideWorkspace) {
		const workspaceUri = URI.file(wsRoot);
		const rootFs = await canonicalFsPath(fileService, workspaceUri);
		const rootCanon = URI.file(rootFs);
		if (!isEqualOrParent(parentCanon, rootCanon)) {
			throw new Error('path escapes workspace');
		}
	}

	const rel = relative(parentFs, normalizeWindowsFsPath(targetUri.fsPath));
	if (rel.startsWith('..') || isAbsolute(rel)) {
		throw new Error('path escapes workspace');
	}

	return join(parentFs, fileName);
}

export async function resolveExistingFileUnderWorkspace(
	fileService: IFileService,
	workspaceRoot: string,
	userPath: string,
	allowOutsideWorkspace = false,
): Promise<string> {
	const trimmed = normalizeWindowsFsPath(userPath.trim());
	if (!trimmed) {
		throw new Error('path must not be empty');
	}
	const wsRoot = normalizeWindowsFsPath(workspaceRoot);
	const joined = isAbsolute(trimmed)
		? normalize(trimmed)
		: normalize(join(wsRoot, trimmed));

	const workspaceUri = URI.file(wsRoot);
	const targetUri = URI.file(joined);

	const rootFs = await canonicalFsPath(fileService, workspaceUri);
	const targetFs = await canonicalFsPath(fileService, targetUri);
	const rootCanon = URI.file(rootFs);
	const targetCanon = URI.file(targetFs);

	if (!allowOutsideWorkspace && !isEqualOrParent(targetCanon, rootCanon)) {
		throw new Error('path escapes workspace');
	}

	return targetFs;
}
