/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../../nls.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../browser/editor.js';
import { EditorExtensions } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { DROX_GIT_GRAPH_OPEN_COMMAND_ID } from '../../common/droxGitGraphService.js';
import { DroxGitGraphEditor } from './droxGitGraphEditor.js';
import { DROX_GIT_GRAPH_EDITOR_ID, DroxGitGraphInput } from './droxGitGraphInput.js';
import './droxGitRevisionContent.js';
import './droxGitGraphTitleBarContribution.js';

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		DroxGitGraphEditor,
		DROX_GIT_GRAPH_EDITOR_ID,
		localize('drox.gitGraph.editorLabel', "Git Graph"),
	),
	[new SyncDescriptor(DroxGitGraphInput)],
);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: DROX_GIT_GRAPH_OPEN_COMMAND_ID,
			title: localize2('drox.gitGraph.open', 'Drox: Git Graph'),
			category: Categories.View,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor, folder?: URI): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const workspace = accessor.get(IWorkspaceContextService);
		let target = folder;
		if (!target) {
			const folder0 = workspace.getWorkspace().folders[0]?.uri;
			target = folder0;
		}
		if (!target || target.scheme !== Schemas.file) {
			return;
		}
		await editorService.openEditor(new DroxGitGraphInput(target), { pinned: true });
	}
});
