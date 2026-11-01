/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxSdtcmGraph, IDroxSdtcmGraphNode } from '../droxSdtcmGraph.js';
import { IDroxSdtcmPoint, moveDroxSdtcmFolders } from './droxSdtcmFolderShift.js';
import { countDroxSdtcmFolderLinks, droxSdtcmIdealLinkDistance } from './droxSdtcmFolderLinks.js';
import { stepDroxSdtcmLinkPull } from './droxSdtcmWeightMotion.js';

/**
 * The folder with the most links starts in the middle.
 * Each other folder starts at the distance its links are happy with.
 */
export function placeDroxSdtcmWeight(graph: IDroxSdtcmGraph, attraction = 0.5): IDroxSdtcmGraph {
	const folders = graph.nodes.filter(node => node.kind === 'folder');
	if (folders.length < 2) {
		return moveDroxSdtcmFolders(graph, new Map(folders.map(folder => [folder.id, { x: 0, y: 0 }])));
	}
	const weights = countDroxSdtcmFolderLinks(graph);
	const hub = [...folders].sort((a, b) => incident(weights, b.id) - incident(weights, a.id) || a.label.localeCompare(b.label))[0];
	const others = folders.filter(folder => folder.id !== hub.id).sort((a, b) => a.label.localeCompare(b.label));
	const origins = new Map<string, IDroxSdtcmPoint>();
	origins.set(hub.id, { x: -hub.w / 2, y: -hub.h / 2 });
	others.forEach((folder, index) => {
		const radius = droxSdtcmIdealLinkDistance(hub.w, hub.h, folder.w, folder.h, weights.get(hub.id)?.get(folder.id) ?? 0, attraction);
		const angle = (index / others.length) * Math.PI * 2 - Math.PI / 2;
		origins.set(folder.id, {
			x: Math.cos(angle) * radius - folder.w / 2,
			y: Math.sin(angle) * radius - folder.h / 2,
		});
	});
	for (let pass = 0; pass < 24; pass++) {
		stepDroxSdtcmLinkPull(origins, graph, attraction, undefined, 0.35);
	}
	return moveDroxSdtcmFolders(graph, shiftToZero(folders, origins));
}

function incident(weights: Map<string, Map<string, number>>, id: string): number {
	let total = 0;
	for (const count of weights.get(id)?.values() ?? []) {
		total += count;
	}
	return total;
}

function shiftToZero(folders: readonly IDroxSdtcmGraphNode[], origins: ReadonlyMap<string, IDroxSdtcmPoint>): Map<string, IDroxSdtcmPoint> {
	let minX = Infinity;
	let minY = Infinity;
	for (const folder of folders) {
		const at = origins.get(folder.id) ?? { x: 0, y: 0 };
		minX = Math.min(minX, at.x);
		minY = Math.min(minY, at.y);
	}
	const shifted = new Map<string, IDroxSdtcmPoint>();
	for (const folder of folders) {
		const at = origins.get(folder.id) ?? { x: 0, y: 0 };
		shifted.set(folder.id, { x: at.x - minX, y: at.y - minY });
	}
	return shifted;
}
