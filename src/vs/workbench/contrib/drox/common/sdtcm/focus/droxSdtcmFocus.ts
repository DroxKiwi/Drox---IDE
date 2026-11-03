/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxSdtcmDataPath } from '../data/droxSdtcmPath.js';
import { droxSdtcmParentFolderId, IDroxSdtcmGraph } from '../droxSdtcmGraph.js';

export type DroxSdtcmFocusMark = 'primary' | 'related' | 'involved' | 'dim';

export interface IDroxSdtcmFocusMarks {
	readonly nodes: ReadonlyMap<string, DroxSdtcmFocusMark>;
	readonly edges: ReadonlyMap<string, 'linked' | 'dim'>;
}

/**
 * Primary folders stay fully visible.
 * A folder linked to one of them is highlighted, and only the data on that link stay bright.
 * Everything else fades.
 * An empty set means the map is shown normally.
 */
export function markDroxSdtcmFocus(graph: IDroxSdtcmGraph, focusIds: ReadonlySet<string>): IDroxSdtcmFocusMarks | undefined {
	if (!focusIds.size) {
		return undefined;
	}
	const folderOfData = new Map<string, string>();
	const fileOfData = new Map<string, string>();
	for (const node of graph.nodes) {
		if ((node.kind === 'data' || node.kind === 'brick') && node.folder) {
			folderOfData.set(node.id, node.folder);
			if (node.file) {
				fileOfData.set(node.id, node.file);
			}
		}
	}
	const involvedData = new Set<string>();
	const related = new Set<string>();
	const edges = new Map<string, 'linked' | 'dim'>();
	for (const edge of graph.edges) {
		const fromFolder = folderOfData.get(edge.from);
		const toFolder = folderOfData.get(edge.to);
		const fromFocus = !!fromFolder && focusIds.has(fromFolder);
		const toFocus = !!toFolder && focusIds.has(toFolder);
		if (fromFocus && toFocus) {
			edges.set(`${edge.from}->${edge.to}`, 'linked');
			continue;
		}
		if ((fromFocus || toFocus) && fromFolder !== toFolder) {
			involvedData.add(edge.from);
			involvedData.add(edge.to);
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
	for (const id of involvedData) {
		const file = fileOfData.get(id);
		if (file) {
			involvedFiles.add(`file:${file}`);
		}
	}
	const folderIds = new Set(graph.nodes.filter(node => node.kind === 'folder').map(node => node.id));
	const held = (folder: string | undefined): boolean => {
		let current = folder;
		while (current) {
			if (focusIds.has(current)) {
				return true;
			}
			current = droxSdtcmParentFolderId(current, folderIds);
		}
		return false;
	};
	const nodes = new Map<string, DroxSdtcmFocusMark>();
	for (const node of graph.nodes) {
		const folder = node.kind === 'folder' ? node.id : node.folder;
		if (!folder || held(folder)) {
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
		} else if (involvedData.has(node.id) || involvedFiles.has(node.id)) {
			nodes.set(node.id, 'involved');
		} else {
			nodes.set(node.id, 'dim');
		}
	}
	return { nodes, edges };
}

/** The path stays bright. Everything else fades, as when a folder is held. */
export function markDroxSdtcmDataPath(graph: IDroxSdtcmGraph, path: IDroxSdtcmDataPath): IDroxSdtcmFocusMarks {
	const nodes = new Map<string, DroxSdtcmFocusMark>();
	for (const node of graph.nodes) {
		if (!path.nodes.has(node.id)) {
			nodes.set(node.id, 'dim');
			continue;
		}
		if (node.kind === 'folder') {
			nodes.set(node.id, 'related');
		} else {
			nodes.set(node.id, 'involved');
		}
	}
	const edges = new Map<string, 'linked' | 'dim'>();
	for (const edge of graph.edges) {
		const key = `${edge.from}->${edge.to}`;
		edges.set(key, path.edges.has(key) ? 'linked' : 'dim');
	}
	return { nodes, edges };
}
