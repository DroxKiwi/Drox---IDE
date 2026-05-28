/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';

/** Parse minimal `.env` (clés DROX_* utilisées par le moteur). */
export function parseDroxEnvFileContent(content: string): Record<string, string> {
	const env: Record<string, string> = {};
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) {
			continue;
		}
		const eq = trimmed.indexOf('=');
		if (eq <= 0) {
			continue;
		}
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"'))
			|| (value.startsWith('\'') && value.endsWith('\''))
		) {
			value = value.slice(1, -1);
		} else {
			const hash = value.indexOf(' #');
			if (hash >= 0) {
				value = value.slice(0, hash).trim();
			}
		}
		if (key.length > 0) {
			env[key] = value;
		}
	}
	return env;
}

export async function readWorkspaceDroxEnv(
	fileService: IFileService,
	workspaceUri: URI | undefined,
): Promise<Record<string, string>> {
	if (!workspaceUri) {
		return {};
	}
	const envUri = URI.joinPath(workspaceUri, '.drox', '.env');
	try {
		const stat = await fileService.stat(envUri);
		if (!stat.isFile) {
			return {};
		}
		const file = await fileService.readFile(envUri);
		return parseDroxEnvFileContent(file.value.toString());
	} catch {
		return {};
	}
}
