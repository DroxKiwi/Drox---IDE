/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file



import { join } from '../../../../base/common/path.js';

import { VSBuffer } from '../../../../base/common/buffer.js';

import { IFileService } from '../../../../platform/files/common/files.js';

import { URI } from '../../../../base/common/uri.js';

import { droxWorkspaceSessionsDir } from './droxWorkspacePaths.js';



export interface IDroxChangesPanelPersistedState {

	readonly dismissedKeys: readonly string[];

}



export function droxSessionChangesPanelPath(workspaceFsPath: string, sessionId: string): string {

	return join(droxWorkspaceSessionsDir(workspaceFsPath), `${sessionId}.changes-panel.json`);

}



export async function readDroxChangesPanelState(

	fileService: IFileService,

	workspaceFsPath: string,

	sessionId: string,

): Promise<IDroxChangesPanelPersistedState> {

	try {

		const raw = (await fileService.readFile(URI.file(droxSessionChangesPanelPath(workspaceFsPath, sessionId)))).value.toString();

		const parsed = JSON.parse(raw) as { dismissedKeys?: unknown };

		if (Array.isArray(parsed.dismissedKeys)) {

			return { dismissedKeys: parsed.dismissedKeys.filter((k): k is string => typeof k === 'string') };

		}

	} catch {

		// fichier absent

	}

	return { dismissedKeys: [] };

}



export async function writeDroxChangesPanelState(

	fileService: IFileService,

	workspaceFsPath: string,

	sessionId: string,

	state: IDroxChangesPanelPersistedState,

): Promise<void> {

	const uri = URI.file(droxSessionChangesPanelPath(workspaceFsPath, sessionId));

	await fileService.createFolder(URI.file(droxWorkspaceSessionsDir(workspaceFsPath)));

	const body = JSON.stringify({ dismissedKeys: [...state.dismissedKeys] }, null, '\t');

	await fileService.writeFile(uri, VSBuffer.fromString(body));

}


