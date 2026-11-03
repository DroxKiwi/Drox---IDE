/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { droxSdtcmParentFolderId, IDroxSdtcmGraph, IDroxSdtcmGraphNode } from '../droxSdtcmGraph.js';

export interface IDroxSdtcmPoint {
	readonly x: number;
	readonly y: number;
}

/** Moves every node by its folder origin, plus the origins of the folders around it. Local coordinates stay intact. */
export function moveDroxSdtcmFolders(graph: IDroxSdtcmGraph, origins: ReadonlyMap<string, IDroxSdtcmPoint>): IDroxSdtcmGraph {
	if (!origins.size) {
		return graph;
	}
	const present = new Set(graph.nodes.filter(node => node.kind === 'folder').map(node => node.id));
	const cache = new Map<string, IDroxSdtcmPoint>();
	const accumulated = (id: string): IDroxSdtcmPoint => {
		const hit = cache.get(id);
		if (hit) {
			return hit;
		}
		const own = origins.get(id) ?? { x: 0, y: 0 };
		const parent = droxSdtcmParentFolderId(id, present);
		const base = parent ? accumulated(parent) : { x: 0, y: 0 };
		const point = { x: own.x + base.x, y: own.y + base.y };
		cache.set(id, point);
		return point;
	};
	return {
		nodes: graph.nodes.map(node => {
			const owner = node.kind === 'folder' ? node.id : node.folder;
			return shiftNode(node, owner ? accumulated(owner) : undefined);
		}),
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
