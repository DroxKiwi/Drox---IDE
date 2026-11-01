/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxSdtcmGraph } from '../droxSdtcmGraph.js';

export const DROX_SDTCM_LINK_PAD = 420;
export const DROX_SDTCM_LINK_LOOSE = 980;

/** Undirected link counts between folder ids. A link inside one folder is ignored. */
export function countDroxSdtcmFolderLinks(graph: IDroxSdtcmGraph): Map<string, Map<string, number>> {
	const folderOf = new Map<string, string>();
	for (const node of graph.nodes) {
		if (node.kind === 'brick' && node.folder) {
			folderOf.set(node.id, node.folder);
		}
	}
	const weights = new Map<string, Map<string, number>>();
	for (const edge of graph.edges) {
		const from = folderOf.get(edge.from);
		const to = folderOf.get(edge.to);
		if (!from || !to || from === to) {
			continue;
		}
		addLink(weights, from, to);
		addLink(weights, to, from);
	}
	return weights;
}

/** Folder whose bricks have the most links toward other folders. */
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

/**
 * Comfortable center distance for a pair.
 * More links and a higher attraction shorten it. No link means the loose distance.
 */
export function droxSdtcmIdealLinkDistance(aw: number, ah: number, bw: number, bh: number, linkCount: number, attraction: number): number {
	const minDist = Math.hypot(aw, ah) / 2 + Math.hypot(bw, bh) / 2 + DROX_SDTCM_LINK_PAD;
	const strength = linkCount <= 0 ? 0 : Math.min(1, Math.max(0, attraction) * linkCount / 4);
	return minDist + (1 - strength) * DROX_SDTCM_LINK_LOOSE;
}

function addLink(weights: Map<string, Map<string, number>>, from: string, to: string): void {
	const row = weights.get(from);
	if (row) {
		row.set(to, (row.get(to) ?? 0) + 1);
	} else {
		weights.set(from, new Map([[to, 1]]));
	}
}
