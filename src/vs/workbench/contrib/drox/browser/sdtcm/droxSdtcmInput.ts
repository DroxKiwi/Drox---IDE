/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';

export const DROX_SDTCM_EDITOR_ID = 'workbench.editor.droxSdtcm';
export const DROX_SDTCM_INPUT_TYPE_ID = 'workbench.input.droxSdtcm';

export class DroxSdtcmInput extends EditorInput {

	static readonly TypeID = DROX_SDTCM_INPUT_TYPE_ID;

	override get typeId(): string {
		return DroxSdtcmInput.TypeID;
	}

	override get editorId(): string | undefined {
		return DROX_SDTCM_EDITOR_ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton;
	}

	override get resource(): URI {
		return URI.from({ scheme: 'drox-sdtcm', path: '/map' });
	}

	override getName(): string {
		return localize('drox.sdtcm.inputName', 'SDTCM');
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (other instanceof DroxSdtcmInput) {
			return true;
		}
		return super.matches(other);
	}
}
