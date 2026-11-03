/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { droxSdtcmParentFolderId, IDroxSdtcmGraph, IDroxSdtcmGraphNode } from '../droxSdtcmGraph.js';
import { IDroxSdtcmPoint, moveDroxSdtcmFolders } from './droxSdtcmFolderShift.js';

const GAP = 36;

/** Root folders in one row. A folder nested in another keeps its place inside that parent. */
export function placeDroxSdtcmFree(graph: IDroxSdtcmGraph): IDroxSdtcmGraph {
	const present = new Set(graph.nodes.filter(node => node.kind === 'folder').map(node => node.id));
	const folders = graph.nodes.filter(node => node.kind === 'folder' && !droxSdtcmParentFolderId(node.id, present)).sort(byLabel);
	const origins = new Map<string, IDroxSdtcmPoint>();
	let cursor = 0;
	for (const folder of folders) {
		origins.set(folder.id, { x: cursor, y: 0 });
		cursor += folder.w + GAP;
	}
	return moveDroxSdtcmFolders(graph, origins);
}

function byLabel(a: IDroxSdtcmGraphNode, b: IDroxSdtcmGraphNode): number {
	return a.label.localeCompare(b.label);
}
