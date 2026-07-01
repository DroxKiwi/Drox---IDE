/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Consommateur des notifications moteur `agent/event` et `agent/done`.
 * Implémentations : webview Drox Chat (`dispatchAgentEvent`) et fenêtre Agents (`droxAgentsChatSink`).
 */
export interface IDroxAgentEventSink {
	handleAgentEvent(params: unknown): void;
	handleAgentDone(params: unknown): void;
}
