/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxSdtcmGraph } from '../droxSdtcmGraph.js';
import { IDroxSdtcmPoint } from './droxSdtcmFolderShift.js';
import { countDroxSdtcmFolderLinks, DROX_SDTCM_LINK_PAD, droxSdtcmIdealLinkDistance } from './droxSdtcmFolderLinks.js';

/**
 * Moves folders along their links.
 * A stronger attraction shortens the distance a link is happy with, so folders come closer.
 * A weaker attraction lengthens it, so they drift apart.
 * The held folder stays under the pointer. Returns true while something is still moving.
 */
export function stepDroxSdtcmLinkPull(origins: Map<string, IDroxSdtcmPoint>, graph: IDroxSdtcmGraph, attraction: number, heldId: string | undefined, gain = 0.08): boolean {
	const folders = graph.nodes.filter(node => node.kind === 'folder');
	if (folders.length < 2) {
		return false;
	}
	const links = countDroxSdtcmFolderLinks(graph);
	const shift = new Map<string, { x: number; y: number }>();
	let moving = false;
	for (let i = 0; i < folders.length; i++) {
		for (let j = i + 1; j < folders.length; j++) {
			const from = folders[i];
			const to = folders[j];
			const fromAt = origins.get(from.id) ?? { x: 0, y: 0 };
			const toAt = origins.get(to.id) ?? { x: 0, y: 0 };
			const dx = (toAt.x + to.w / 2) - (fromAt.x + from.w / 2);
			const dy = (toAt.y + to.h / 2) - (fromAt.y + from.h / 2);
			const dist = Math.hypot(dx, dy) || 1;
			const count = links.get(from.id)?.get(to.id) ?? 0;
			const ideal = count === 0
				? Math.hypot(from.w, from.h) / 2 + Math.hypot(to.w, to.h) / 2 + DROX_SDTCM_LINK_PAD
				: droxSdtcmIdealLinkDistance(from.w, from.h, to.w, to.h, count, attraction);
			if (count === 0 && dist >= ideal) {
				continue;
			}
			const delta = (dist - ideal) * gain;
			if (Math.abs(delta) < 0.35) {
				continue;
			}
			const ux = (dx / dist) * delta;
			const uy = (dy / dist) * delta;
			const moveFrom = from.id !== heldId;
			const moveTo = to.id !== heldId;
			const share = moveFrom && moveTo ? 0.5 : 1;
			if (moveFrom) {
				push(shift, from.id, ux * share, uy * share);
			}
			if (moveTo) {
				push(shift, to.id, -ux * share, -uy * share);
			}
			moving = moving || moveFrom || moveTo;
		}
	}
	for (const [id, delta] of shift) {
		const at = origins.get(id) ?? { x: 0, y: 0 };
		origins.set(id, { x: at.x + delta.x, y: at.y + delta.y });
	}
	return moving;
}

function push(shift: Map<string, { x: number; y: number }>, id: string, x: number, y: number): void {
	const at = shift.get(id);
	if (at) {
		at.x += x;
		at.y += y;
	} else {
		shift.set(id, { x, y });
	}
}
