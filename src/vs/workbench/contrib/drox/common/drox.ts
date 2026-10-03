/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export namespace DroxViews {
	export const ViewContainerId = 'workbench.view.drox';
	export const ChatViewId = 'workbench.view.drox.chat';
	export const NativeChatViewId = 'workbench.view.drox.nativeChat';
	/** Sidebar activity-bar container (replaces Explorer when active). */
	export const ChangesViewContainerId = 'workbench.view.drox.changesContainer';
	export const ChangesViewId = 'workbench.view.drox.changes';
	/** Sidebar activity-bar container — @Codebase cockpit (IDE). */
	export const CodebaseViewContainerId = 'workbench.view.drox.codebaseContainer';
	export const CodebaseViewId = 'workbench.view.drox.codebase';
	/** Agents auxiliary bar — same cockpit UI, keeps Sessions list visible. */
	export const CodebaseSessionsViewContainerId = 'workbench.view.drox.codebaseSessionsContainer';
	export const CodebaseSessionsViewId = 'workbench.view.drox.codebaseSessions';
	/** Optional bottom panel host (Terminal-like) for the same cockpit view. */
	export const CodebasePanelViewContainerId = 'workbench.view.drox.codebasePanelContainer';
	export const CodebasePanelViewId = 'workbench.view.drox.codebasePanel';
	/** Sidebar activity-bar container — model regulation observatory (IDE). */
	export const RegulationViewContainerId = 'workbench.view.drox.regulationContainer';
	export const RegulationViewId = 'workbench.view.drox.regulation';
	/** Agents auxiliary bar — same regulation UI. */
	export const RegulationSessionsViewContainerId = 'workbench.view.drox.regulationSessionsContainer';
	export const RegulationSessionsViewId = 'workbench.view.drox.regulationSessions';
	/** Sidebar — traffic observatory (MITM / in-out requests). */
	export const TrafficViewContainerId = 'workbench.view.drox.trafficContainer';
	export const TrafficViewId = 'workbench.view.drox.traffic';
	/** Agents auxiliary bar — same traffic UI. */
	export const TrafficSessionsViewContainerId = 'workbench.view.drox.trafficSessionsContainer';
	export const TrafficSessionsViewId = 'workbench.view.drox.trafficSessions';
	/** Sidebar — declarative port forwards (external tool). */
	export const PortsViewContainerId = 'workbench.view.drox.portsContainer';
	export const PortsViewId = 'workbench.view.drox.ports';
	/** Agents auxiliary bar — same ports UI. */
	export const PortsSessionsViewContainerId = 'workbench.view.drox.portsSessionsContainer';
	export const PortsSessionsViewId = 'workbench.view.drox.portsSessions';
}

export namespace DroxCommands {
	export const OpenChat = 'workbench.action.openDroxChat';
	export const NewChat = 'workbench.action.newDroxChat';
	export const OpenSettings = 'workbench.action.openDroxSettings';
	/** Open connection setup (wizard / server panel) from IDE or Agents. */
	export const ConnectAi = 'workbench.action.droxConnectAi';
	export const AddReferences = 'workbench.action.droxAddReferences';
	export const AddDiagnosticToChat = 'workbench.action.droxAddDiagnosticToChat';
	export const RevertLastRun = 'workbench.action.droxRevertLastRun';
	export const UndoFileChange = 'workbench.action.droxUndoFileChange';
	export const RedoFileChange = 'workbench.action.droxRedoFileChange';
	export const OpenSessionFile = 'workbench.action.droxOpenSessionFile';
	/** Focus shared @Codebase cockpit (sidebar). */
	export const FocusCodebase = 'workbench.action.droxFocusCodebase';
	export const CodebaseReindex = 'workbench.action.droxCodebaseReindex';
	export const CodebasePause = 'workbench.action.droxCodebasePause';
	export const CodebasePurge = 'workbench.action.droxCodebasePurge';
	export const CodebaseExportDiag = 'workbench.action.droxCodebaseExportDiag';
}
