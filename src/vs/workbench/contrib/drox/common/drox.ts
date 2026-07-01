/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export namespace DroxViews {
	export const ViewContainerId = 'workbench.view.drox';
	export const ChatViewId = 'workbench.view.drox.chat';
	export const NativeChatViewId = 'workbench.view.drox.nativeChat';
}

export namespace DroxCommands {
	export const OpenChat = 'workbench.action.openDroxChat';
	export const NewChat = 'workbench.action.newDroxChat';
	export const OpenSettings = 'workbench.action.openDroxSettings';
	export const AddReferences = 'workbench.action.droxAddReferences';
	export const AddDiagnosticToChat = 'workbench.action.droxAddDiagnosticToChat';
	export const RevertLastRun = 'workbench.action.droxRevertLastRun';
	export const UndoFileChange = 'workbench.action.droxUndoFileChange';
	export const RedoFileChange = 'workbench.action.droxRedoFileChange';
}
