/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxSdtcmGraph } from '../droxSdtcmGraph.js';
import { placeDroxSdtcmFree } from './droxSdtcmFreePlacement.js';
import { placeDroxSdtcmWeight } from './droxSdtcmWeightPlacement.js';

export type DroxSdtcmPlacementMode = 'free' | 'weight';

export function clampDroxSdtcmAttraction(value: number): number {
	if (!Number.isFinite(value)) {
		return 0.5;
	}
	return Math.min(1, Math.max(0, value));
}

export { shiftDroxSdtcmFolders } from './droxSdtcmFolderShift.js';
export { stepDroxSdtcmLinkPull } from './droxSdtcmWeightMotion.js';

export function placeDroxSdtcmGraph(graph: IDroxSdtcmGraph, mode: DroxSdtcmPlacementMode, attraction = 0.5): IDroxSdtcmGraph {
	if (mode === 'weight') {
		return placeDroxSdtcmWeight(graph, clampDroxSdtcmAttraction(attraction));
	}
	return placeDroxSdtcmFree(graph);
}
