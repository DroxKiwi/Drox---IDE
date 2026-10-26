/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Schemas } from '../../../../../../base/common/network.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { EditorInputCapabilities, EditorResourceAccessor, SideBySideEditor } from '../../../../../common/editor.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { DroxMotionSetting } from '../droxMotionConfiguration.js';
import { DroxMotionSurface } from '../droxMotionSurface.js';

const SOURCE_SCHEMES = new Set([Schemas.file, Schemas.untitled, Schemas.vscodeRemote]);

/** Custom Drox / workbench panes — no text editor reveal. */
const EXCLUDED_TYPE_IDS = new Set([
	'workbench.input.gitGraph',
	'workbench.editors.webviewEditor',
	'workbench.editors.releaseNotes',
]);

export function droxMotionSurfaceForWorkbench(
	environmentService: IWorkbenchEnvironmentService,
): DroxMotionSurface {
	return environmentService.isSessionsWindow ? DroxMotionSurface.Agent : DroxMotionSurface.Ide;
}

export function shouldRunDroxIdeEditorReveal(
	editor: EditorInput,
	configurationService: IConfigurationService,
	environmentService: IWorkbenchEnvironmentService,
): boolean {
	if (droxMotionSurfaceForWorkbench(environmentService) !== DroxMotionSurface.Ide) {
		return false;
	}
	if (configurationService.getValue<boolean>(DroxMotionSetting.IdeEditorRevealEnabled) === false) {
		return false;
	}
	if (EXCLUDED_TYPE_IDS.has(editor.typeId)) {
		return false;
	}
	if (editor.hasCapability(EditorInputCapabilities.Scratchpad)) {
		return false;
	}
	const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
	if (!resource || !SOURCE_SCHEMES.has(resource.scheme)) {
		return false;
	}
	return true;
}
