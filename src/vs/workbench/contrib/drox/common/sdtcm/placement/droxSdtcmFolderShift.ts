/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxSdtcmGraph, IDroxSdtcmGraphNode } from '../droxSdtcmGraph.js';

export interface IDroxSdtcmPoint {
	readonly x: number;
	readonly y: number;
}

/** Moves every node of a folder by the same origin. Local coordinates stay intact. */
export function moveDroxSdtcmFolders(graph: IDroxSdtcmGraph, origins: ReadonlyMap<string, IDroxSdtcmPoint>): IDroxSdtcmGraph {
	if (!origins.size) {
		return graph;
	}
	return {
		nodes: graph.nodes.map(node => shiftNode(node, node.folder ? origins.get(node.folder) : undefined)),
		edges: graph.edges,
	};
}

/** Extra displacement the user is holding, on top of the placement. */
export function shiftDroxSdtcmFolders(graph: IDroxSdtcmGraph, offsets: ReadonlyMap<string, IDroxSdtcmPoint>): IDroxSdtcmGraph {
	return moveDroxSdtcmFolders(graph, offsets);
}

function shiftNode(node: IDroxSdtcmGraphNode, delta: IDroxSdtcmPoint | undefined): IDroxSdtcmGraphNode {
	if (!delta || (delta.x === 0 && delta.y === 0)) {
		return node;
	}
	return { ...node, x: node.x + delta.x, y: node.y + delta.y };
}
