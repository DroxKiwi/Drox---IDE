/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxSdtcmGraph, IDroxSdtcmGraphNode } from './droxSdtcmGraph.js';

/** How the map is being looked at. World coordinates stay complete underneath. */
export interface IDroxSdtcmCamera {
	readonly panX: number;
	readonly panY: number;
	readonly zoom: number;
	readonly viewWidth: number;
	readonly viewHeight: number;
}

/** Nodes drawn for one image. The rest of the world stays in the layout. */
const DRAW_BUDGET = 480;
const FOLDER_MIN_PX = 8;
const DETAIL_MIN_PX = 14;
const VIEW_MARGIN_PX = 160;

/**
 * Nodes large enough on screen, inside the camera, up to the draw budget.
 * Largest first, so a zoomed-out project keeps its big folders.
 */
export function frameDroxSdtcmGraph(graph: IDroxSdtcmGraph, camera: IDroxSdtcmCamera): IDroxSdtcmGraph {
	const zoom = camera.zoom > 0 ? camera.zoom : 1;
	const left = -camera.panX / zoom - VIEW_MARGIN_PX / zoom;
	const top = -camera.panY / zoom - VIEW_MARGIN_PX / zoom;
	const right = left + camera.viewWidth / zoom + (VIEW_MARGIN_PX * 2) / zoom;
	const bottom = top + camera.viewHeight / zoom + (VIEW_MARGIN_PX * 2) / zoom;
	const ranked: { node: IDroxSdtcmGraphNode; px: number }[] = [];
	for (const node of graph.nodes) {
		if (node.x + node.w < left || node.x > right || node.y + node.h < top || node.y > bottom) {
			continue;
		}
		const px = Math.min(node.w, node.h) * zoom;
		const min = node.kind === 'folder' ? FOLDER_MIN_PX : DETAIL_MIN_PX;
		if (px < min) {
			continue;
		}
		ranked.push({ node, px });
	}
	ranked.sort((a, b) => b.px - a.px || (a.node.kind === 'folder' ? -1 : 1));
	const chosen = ranked.slice(0, DRAW_BUDGET).map(item => item.node);
	const ids = new Set(chosen.map(node => node.id));
	return {
		nodes: chosen,
		edges: graph.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)),
	};
}
