/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxSdtcmDataPath, traceDroxSdtcmSelection } from '../data/droxSdtcmPath.js';
import { droxSdtcmParentFolderId, IDroxSdtcmGraph, IDroxSdtcmGraphNode } from '../droxSdtcmGraph.js';
import { IDroxSdtcmMap, isDroxSdtcmDataId } from '../droxSdtcmMap.js';
import { droxSdtcmFreshBricks } from '../droxSdtcmRole.js';

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

/**
 * The kept entities use the same bright path as a left click, joined together.
 * A click path is added on top. With neither, the map stays evenly lit.
 */
export function markDroxSdtcmKept(
	graph: IDroxSdtcmGraph,
	map: IDroxSdtcmMap,
	focusIds: ReadonlySet<string>,
	click?: IDroxSdtcmDataPath,
): IDroxSdtcmFocusMarks | undefined {
	const nodes = new Set<string>(click?.nodes ?? []);
	const edges = new Set<string>(click?.edges ?? []);
	for (const id of focusIds) {
		if (id.startsWith('folder:')) {
			addFolderFocus(graph, id, nodes, edges);
			continue;
		}
		const kind = id.startsWith('file:') ? 'file' : isDroxSdtcmDataId(id) ? 'data' : 'brick';
		const traced = traceDroxSdtcmSelection(map, kind, id);
		if (!traced) {
			nodes.add(id);
			continue;
		}
		for (const node of traced.nodes) {
			nodes.add(node);
		}
		for (const edge of traced.edges) {
			edges.add(edge);
		}
	}
	if (!nodes.size) {
		return undefined;
	}
	return markDroxSdtcmDataPath(graph, { nodes, edges });
}

function addFolderFocus(graph: IDroxSdtcmGraph, folderId: string, nodes: Set<string>, edges: Set<string>): void {
	const inside = new Set<string>();
	for (const node of graph.nodes) {
		if (node.id === folderId || nodeHeldBy(folderId, node)) {
			inside.add(node.id);
			nodes.add(node.id);
		}
	}
	nodes.add(folderId);
	let path = folderId.slice('folder:'.length);
	if (path !== '(root)') {
		nodes.add('folder:(root)');
	}
	while (path.includes('/')) {
		path = path.slice(0, path.lastIndexOf('/'));
		nodes.add(`folder:${path}`);
	}
	for (const edge of graph.edges) {
		if (inside.has(edge.from) && inside.has(edge.to)) {
			edges.add(`${edge.from}->${edge.to}`);
		}
	}
}

function nodeHeldBy(folderId: string, node: IDroxSdtcmGraphNode): boolean {
	if (folderId === 'folder:(root)') {
		return true;
	}
	return node.id.startsWith(`${folderId}/`) || node.folder === folderId || (node.folder?.startsWith(`${folderId}/`) ?? false);
}

/** A kept entity stays bright when a selection fades the rest of the map. */
export function keepDroxSdtcmFocusVisible(marks: IDroxSdtcmFocusMarks, focusIds: ReadonlySet<string>): IDroxSdtcmFocusMarks {
	if (!focusIds.size) {
		return marks;
	}
	const nodes = new Map(marks.nodes);
	for (const id of focusIds) {
		nodes.set(id, 'primary');
	}
	return { nodes, edges: marks.edges };
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

/**
 * Ids that showed up on the map: a new folder, file, brick, or data.
 * A brick or data that was rewritten keeps its signature, so a new id alone does not count.
 */
export function droxSdtcmAddedFocus(before: IDroxSdtcmMap, after: IDroxSdtcmMap, beforeListed: readonly string[] = [], afterListed: readonly string[] = []): string[] {
	const beforeFiles = droxSdtcmKnownFiles(before, beforeListed);
	const afterFiles = droxSdtcmKnownFiles(after, afterListed);
	const beforeFolders = droxSdtcmFolderIds(beforeFiles);
	const added = [...droxSdtcmFolderIds(afterFiles)].filter(folder => !beforeFolders.has(folder));
	added.sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : a > b ? 1 : 0));
	for (const file of [...afterFiles].sort()) {
		if (!beforeFiles.has(file)) {
			added.push(`file:${file}`);
		}
	}
	for (const id of droxSdtcmFreshBricks(before.bricks, after.bricks)) {
		added.push(id);
	}
	const dataLeft = new Map<string, number>();
	for (const item of before.data) {
		const key = `${item.file}\u0000${item.name}\u0000${item.birth}`;
		dataLeft.set(key, (dataLeft.get(key) ?? 0) + 1);
	}
	for (const item of after.data) {
		const key = `${item.file}\u0000${item.name}\u0000${item.birth}`;
		const left = dataLeft.get(key) ?? 0;
		if (left > 0) {
			dataLeft.set(key, left - 1);
		} else {
			added.push(item.id);
		}
	}
	return added;
}

function droxSdtcmKnownFiles(map: IDroxSdtcmMap, listed: readonly string[]): Set<string> {
	const files = new Set(listed);
	for (const brick of map.bricks) {
		files.add(brick.file);
	}
	for (const item of map.data) {
		files.add(item.file);
	}
	return files;
}

/** Folder ids drawn for these files, including `(root)` when a file sits there. */
function droxSdtcmFolderIds(files: ReadonlySet<string>): Set<string> {
	const folders = new Set<string>();
	for (const file of files) {
		const parts = file.split('/');
		let current: string | undefined = parts.length < 2 ? '(root)' : parts.slice(0, -1).join('/');
		while (current) {
			folders.add(`folder:${current}`);
			const slash = current.lastIndexOf('/');
			current = current === '(root)' ? undefined : slash === -1 ? undefined : current.slice(0, slash);
		}
	}
	return folders;
}
