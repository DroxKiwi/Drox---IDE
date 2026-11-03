/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IDroxSdtcmFolderMove {
	readonly id: string;
	readonly before: { readonly x: number; readonly y: number };
	readonly after: { readonly x: number; readonly y: number };
}

export interface IDroxSdtcmMoveHistory {
	readonly undo: readonly IDroxSdtcmFolderMove[];
	readonly redo: readonly IDroxSdtcmFolderMove[];
}

export function emptyDroxSdtcmMoveHistory(): IDroxSdtcmMoveHistory {
	return { undo: [], redo: [] };
}

/** A finished drag. The redo list is dropped, because the next gesture is a new branch. */
export function rememberDroxSdtcmMove(history: IDroxSdtcmMoveHistory, move: IDroxSdtcmFolderMove): IDroxSdtcmMoveHistory {
	return { undo: [...history.undo, move].slice(-40), redo: [] };
}

export function undoDroxSdtcmMove(history: IDroxSdtcmMoveHistory): { history: IDroxSdtcmMoveHistory; move: IDroxSdtcmFolderMove } | undefined {
	const move = history.undo[history.undo.length - 1];
	if (!move) {
		return undefined;
	}
	return { move, history: { undo: history.undo.slice(0, -1), redo: [...history.redo, move] } };
}

export function redoDroxSdtcmMove(history: IDroxSdtcmMoveHistory): { history: IDroxSdtcmMoveHistory; move: IDroxSdtcmFolderMove } | undefined {
	const move = history.redo[history.redo.length - 1];
	if (!move) {
		return undefined;
	}
	return { move, history: { undo: [...history.undo, move], redo: history.redo.slice(0, -1) } };
}
