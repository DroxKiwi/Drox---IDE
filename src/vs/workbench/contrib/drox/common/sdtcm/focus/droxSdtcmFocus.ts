/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxSdtcmGraph } from '../droxSdtcmGraph.js';

export type DroxSdtcmFocusMark = 'primary' | 'related' | 'involved' | 'dim';

export interface IDroxSdtcmFocusMarks {
	readonly nodes: ReadonlyMap<string, DroxSdtcmFocusMark>;
	readonly edges: ReadonlyMap<string, 'linked' | 'dim'>;
}

/**
 * Primary folders stay fully visible.
 * A folder linked to one of them is highlighted, and only the bricks on that link stay bright.
 * Everything else fades.
 * An empty set means the map is shown normally.
 */
export function markDroxSdtcmFocus(graph: IDroxSdtcmGraph, focusIds: ReadonlySet<string>): IDroxSdtcmFocusMarks | undefined {
	if (!focusIds.size) {
		return undefined;
	}
	const folderOfBrick = new Map<string, string>();
	const fileOfBrick = new Map<string, string>();
	for (const node of graph.nodes) {
		if (node.kind === 'brick' && node.folder) {
			folderOfBrick.set(node.id, node.folder);
			if (node.file) {
				fileOfBrick.set(node.id, node.file);
			}
		}
	}
	const involvedBricks = new Set<string>();
	const related = new Set<string>();
	const edges = new Map<string, 'linked' | 'dim'>();
	for (const edge of graph.edges) {
		const fromFolder = folderOfBrick.get(edge.from);
		const toFolder = folderOfBrick.get(edge.to);
		const fromFocus = !!fromFolder && focusIds.has(fromFolder);
		const toFocus = !!toFolder && focusIds.has(toFolder);
		if (fromFocus && toFocus) {
			edges.set(`${edge.from}->${edge.to}`, 'linked');
			continue;
		}
		if ((fromFocus || toFocus) && fromFolder !== toFolder) {
			involvedBricks.add(edge.from);
			involvedBricks.add(edge.to);
			if (fromFolder && !fromFocus) {
				related.add(fromFolder);
			}
			if (toFolder && !toFocus) {
				related.add(toFolder);
			}
			edges.set(`${edge.from}->${edge.to}`, 'linked');
		} else {
			edges.set(`${edge.from}->${edge.to}`, 'dim');
		}
	}
	const involvedFiles = new Set<string>();
	for (const id of involvedBricks) {
		const file = fileOfBrick.get(id);
		if (file) {
			involvedFiles.add(`file:${file}`);
		}
	}
	const nodes = new Map<string, DroxSdtcmFocusMark>();
	for (const node of graph.nodes) {
		const folder = node.kind === 'folder' ? node.id : node.folder;
		if (!folder || focusIds.has(folder)) {
			if (node.kind === 'folder' && folder && focusIds.has(folder)) {
				nodes.set(node.id, 'primary');
			}
			continue;
		}
		if (!related.has(folder)) {
			nodes.set(node.id, 'dim');
			continue;
		}
		if (node.kind === 'folder') {
			nodes.set(node.id, 'related');
		} else if (involvedBricks.has(node.id) || involvedFiles.has(node.id)) {
			nodes.set(node.id, 'involved');
		} else {
			nodes.set(node.id, 'dim');
		}
	}
	return { nodes, edges };
}
