/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { join } from '../../../../base/common/path.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { droxWorkspaceSessionsDir } from './droxWorkspacePaths.js';

/** Barre de titre du chat : icône bug cochée = capture en cours. */
export const DroxRunCaptureArmedContext = new RawContextKey<boolean>('droxRunCaptureArmed', false);

/** Armé uniquement par le bouton dev. Défaut : off. */
let armed = false;

export function isDroxRunCaptureArmed(): boolean {
	return armed;
}

export function setDroxRunCaptureArmed(recording: boolean): void {
	armed = recording;
}

/** `<workspace>/.drox/sessions/ses_….run-capture.jsonl` */
export function droxSessionRunCapturePath(workspaceFsPath: string, sessionId: string): string {
	return join(droxWorkspaceSessionsDir(workspaceFsPath), `${sessionId}.run-capture.jsonl`);
}
