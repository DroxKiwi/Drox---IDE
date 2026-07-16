/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { mainWindow } from '../../../../base/browser/window.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { CHANGES_VIEW_ID } from '../../changes/common/changes.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { IDroxSessionLayoutSnapshot } from '../common/droxSessionBackgroundService.js';

export function captureDroxSessionLayoutSnapshot(
	sessionId: string,
	editorService: IEditorService,
	editorGroupsService: IEditorGroupsService,
	layoutService: IAgentWorkbenchLayoutService,
	viewsService: IViewsService,
): IDroxSessionLayoutSnapshot {
	const workingSetName = `drox-session-snapshot:${sessionId}`;
	const editorWorkingSet = editorService.visibleEditors.length > 0
		? editorGroupsService.saveWorkingSet(workingSetName)
		: undefined;
	return {
		panelVisible: layoutService.isVisible(Parts.PANEL_PART, mainWindow),
		auxiliaryBarVisible: layoutService.isVisible(Parts.AUXILIARYBAR_PART, mainWindow),
		auxiliaryBarActiveViewContainerId: viewsService.getActiveViewWithId(CHANGES_VIEW_ID)
			? CHANGES_VIEW_ID
			: undefined,
		editorWorkingSet,
	};
}

export async function applyDroxSessionLayoutSnapshot(
	snapshot: IDroxSessionLayoutSnapshot,
	editorGroupsService: IEditorGroupsService,
	layoutService: IAgentWorkbenchLayoutService,
	viewsService: IViewsService,
): Promise<void> {
	layoutService.setPartHidden(!snapshot.panelVisible, Parts.PANEL_PART);
	layoutService.setPartHidden(!snapshot.auxiliaryBarVisible, Parts.AUXILIARYBAR_PART);
	if (snapshot.auxiliaryBarVisible) {
		await viewsService.openView(CHANGES_VIEW_ID, false);
	}

	const showEditor = !!snapshot.editorWorkingSet;
	const suppression = layoutService.suppressEditorPartAutoVisibility();
	try {
		if (snapshot.editorWorkingSet) {
			await editorGroupsService.applyWorkingSet(snapshot.editorWorkingSet, { preserveFocus: false });
		} else {
			await editorGroupsService.applyWorkingSet('empty', { preserveFocus: false });
		}
	} finally {
		suppression.dispose();
	}
	layoutService.setPartHidden(!showEditor, Parts.EDITOR_PART);
}

export async function applyDroxDefaultWorkspaceTemplate(
	editorGroupsService: IEditorGroupsService,
	layoutService: IAgentWorkbenchLayoutService,
	viewsService: IViewsService,
): Promise<void> {
	const suppression = layoutService.suppressEditorPartAutoVisibility();
	try {
		await editorGroupsService.applyWorkingSet('empty', { preserveFocus: false });
	} finally {
		suppression.dispose();
	}
	layoutService.setPartHidden(true, Parts.PANEL_PART);
	layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
	await viewsService.openView(CHANGES_VIEW_ID, false);
	// Chat + Changes only — editor/terminal column stays hidden until the user
	// or agent opens a file or shell (see workbench onWillOpenEditor).
	layoutService.setPartHidden(true, Parts.EDITOR_PART);
}

export function deleteDroxSessionLayoutSnapshot(
	snapshot: IDroxSessionLayoutSnapshot | undefined,
	editorGroupsService: IEditorGroupsService,
): void {
	if (!snapshot?.editorWorkingSet) {
		return;
	}
	editorGroupsService.deleteWorkingSet(snapshot.editorWorkingSet);
}
