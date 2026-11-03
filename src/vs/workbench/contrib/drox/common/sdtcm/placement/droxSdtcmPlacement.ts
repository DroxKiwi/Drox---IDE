/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxSdtcmGraph } from '../droxSdtcmGraph.js';
import { placeDroxSdtcmFree } from './droxSdtcmFreePlacement.js';

export { shiftDroxSdtcmFolders } from './droxSdtcmFolderShift.js';

export function placeDroxSdtcmGraph(graph: IDroxSdtcmGraph): IDroxSdtcmGraph {
	return placeDroxSdtcmFree(graph);
}
