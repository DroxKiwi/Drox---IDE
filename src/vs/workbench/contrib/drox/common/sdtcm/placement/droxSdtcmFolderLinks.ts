/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { droxSdtcmParentFolderId, IDroxSdtcmGraph } from '../droxSdtcmGraph.js';

/** Undirected link counts between folder ids. A link inside one folder is ignored. */
export function countDroxSdtcmFolderLinks(graph: IDroxSdtcmGraph): Map<string, Map<string, number>> {
	const folderOf = new Map<string, string>();
	for (const node of graph.nodes) {
		if ((node.kind === 'data' || node.kind === 'brick') && node.folder) {
			folderOf.set(node.id, node.folder);
		}
	}
	const present = new Set(graph.nodes.filter(node => node.kind === 'folder').map(node => node.id));
	const rootOf = (id: string) => {
		let current = id;
		let parent = droxSdtcmParentFolderId(current, present);
		while (parent) {
			current = parent;
			parent = droxSdtcmParentFolderId(current, present);
		}
		return current;
	};
	const weights = new Map<string, Map<string, number>>();
	for (const edge of graph.edges) {
		const fromFolder = folderOf.get(edge.from);
		const toFolder = folderOf.get(edge.to);
		const from = fromFolder ? rootOf(fromFolder) : undefined;
		const to = toFolder ? rootOf(toFolder) : undefined;
		if (!from || !to || from === to) {
			continue;
		}
		addLink(weights, from, to);
		addLink(weights, to, from);
	}
	return weights;
}

/** Folder whose data have the most links toward other folders. */
export function mostLinkedDroxSdtcmFolderId(graph: IDroxSdtcmGraph): string | undefined {
	const folders = graph.nodes.filter(node => node.kind === 'folder');
	if (!folders.length) {
		return undefined;
	}
	const weights = countDroxSdtcmFolderLinks(graph);
	return [...folders].sort((a, b) => incident(weights, b.id) - incident(weights, a.id) || a.label.localeCompare(b.label))[0].id;
}

function incident(weights: Map<string, Map<string, number>>, id: string): number {
	let total = 0;
	for (const count of weights.get(id)?.values() ?? []) {
		total += count;
	}
	return total;
}

function addLink(weights: Map<string, Map<string, number>>, from: string, to: string): void {
	const row = weights.get(from);
	if (row) {
		row.set(to, (row.get(to) ?? 0) + 1);
	} else {
		weights.set(from, new Map([[to, 1]]));
	}
}
