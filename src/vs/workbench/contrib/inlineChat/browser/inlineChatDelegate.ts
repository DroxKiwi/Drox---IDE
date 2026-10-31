/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';

/** Which tab of the Drox inline panel to show. */
export type DroxInlineChatTab = 'chat' | 'explain';

export interface IDroxInlineChatOpenRequest {
	readonly tab: DroxInlineChatTab;
	readonly message?: string;
	readonly autoSend?: boolean;
}

type DroxInlineChatOpener = (editor: ICodeEditor, request: IDroxInlineChatOpenRequest) => Promise<boolean>;

let opener: DroxInlineChatOpener | undefined;

/** Drox replaces the native inline chat widget when this is set. */
export function setDroxInlineChatOpener(next: DroxInlineChatOpener | undefined): void {
	opener = next;
}

export async function tryOpenDroxInlineChat(editor: ICodeEditor, request: IDroxInlineChatOpenRequest): Promise<boolean> {
	if (!opener) {
		return false;
	}
	return opener(editor, request);
}
