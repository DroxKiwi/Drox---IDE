/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { VSBuffer } from '../../../../base/common/buffer.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { isListableDroxSessionId } from './droxSession.js';
import { droxWorkspaceSessionsDir } from './droxWorkspacePaths.js';

/** Plafond d'injection `system` pour le carnet (N0 — zéro Rust). */
export const DROX_SESSION_NOTES_INJECTION_MAX_BYTES = 12 * 1024;

export const DROX_SESSION_NOTES_TEMPLATE = `# Session notes

## Rules
<!-- Constraints for this discussion (tone, must / must-not). Optional. -->

## Ideas
<!-- Goals, hypotheses, open questions for this thread. -->

## Free
<!-- Anything else. The template is optional — rewrite freely. -->
`;

export function droxSessionNotesPath(workspaceFsPath: string, sessionId: string): string {
	return join(droxWorkspaceSessionsDir(workspaceFsPath), `${sessionId}.notes.md`);
}

export function droxSessionNotesUri(workspaceFsPath: string, sessionId: string): URI {
	return URI.file(droxSessionNotesPath(workspaceFsPath, sessionId));
}

/** Crée le template si absent ; n'écrase jamais un carnet existant. */
export async function ensureDroxSessionNotesFile(
	fileService: IFileService,
	workspaceFsPath: string,
	sessionId: string,
): Promise<URI | undefined> {
	if (!isListableDroxSessionId(sessionId) || !workspaceFsPath) {
		return undefined;
	}
	const uri = droxSessionNotesUri(workspaceFsPath, sessionId);
	try {
		if (await fileService.exists(uri)) {
			return uri;
		}
		await fileService.createFolder(URI.file(droxWorkspaceSessionsDir(workspaceFsPath)));
		await fileService.writeFile(uri, VSBuffer.fromString(DROX_SESSION_NOTES_TEMPLATE));
		return uri;
	} catch {
		return undefined;
	}
}

/**
 * Lit le carnet et produit un préfixe `system` pour `agent.run`.
 * Retourne `undefined` si vide / introuvable / erreur.
 */
export async function readDroxSessionNotesSystemSupplement(
	fileService: IFileService,
	workspaceFsPath: string,
	sessionId: string,
): Promise<string | undefined> {
	if (!isListableDroxSessionId(sessionId) || !workspaceFsPath) {
		return undefined;
	}
	const uri = droxSessionNotesUri(workspaceFsPath, sessionId);
	try {
		if (!(await fileService.exists(uri))) {
			return undefined;
		}
		let text = (await fileService.readFile(uri)).value.toString();
		text = text.replace(/^\uFEFF/, '').trim();
		if (!text) {
			return undefined;
		}
		let truncated = false;
		if (text.length > DROX_SESSION_NOTES_INJECTION_MAX_BYTES) {
			text = text.slice(0, DROX_SESSION_NOTES_INJECTION_MAX_BYTES);
			truncated = true;
		}
		const body = truncated ? `${text}\n\n(truncated)` : text;
		return [
			'[Session notes — user notepad for this discussion]',
			'---',
			body,
			'---',
		].join('\n');
	} catch {
		return undefined;
	}
}
