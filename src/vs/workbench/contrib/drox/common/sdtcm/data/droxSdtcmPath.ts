/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxSdtcmMap } from '../droxSdtcmMap.js';

export interface IDroxSdtcmDataPath {
	readonly nodes: ReadonlySet<string>;
	readonly edges: ReadonlySet<string>;
}

export type DroxSdtcmPathKind = 'file' | 'brick' | 'data';

/**
 * The chain that contains this element, from the start through it to the end.
 * An element that only receives links still keeps those incoming links.
 * An element with no link still returns itself, so the rest of the map can fade.
 */
export function traceDroxSdtcmSelection(map: IDroxSdtcmMap, kind: DroxSdtcmPathKind, id: string): IDroxSdtcmDataPath | undefined {
	const bricks = new Map(map.bricks.map(brick => [brick.id, brick]));
	const byId = new Map(map.data.map(item => [item.id, item]));
	const file = kind === 'file' ? id.slice('file:'.length) : undefined;
	if (kind === 'data' && !byId.has(id)) {
		return undefined;
	}
	if (kind === 'brick' && !bricks.has(id)) {
		return undefined;
	}
	if (kind === 'file' && file !== undefined && !map.bricks.some(brick => brick.file === file) && !map.data.some(item => item.file === file)) {
		const nodes = new Set<string>([id]);
		addFolderChain(nodes, file);
		return { nodes, edges: new Set() };
	}
	const dataIds = new Set<string>();
	if (kind === 'data') {
		collectData(map, byId, dataIds, id);
	} else if (kind === 'brick') {
		for (const item of map.data) {
			if (item.brick === id || item.steps.some(step => step.brick === id)) {
				collectData(map, byId, dataIds, item.id);
			}
		}
	} else if (file !== undefined) {
		for (const item of map.data) {
			if (item.file === file) {
				collectData(map, byId, dataIds, item.id);
			}
		}
	}
	const seeds = new Set<string>();
	if (kind === 'brick') {
		seeds.add(id);
	}
	if (file !== undefined) {
		for (const brick of map.bricks) {
			if (brick.file === file) {
				seeds.add(brick.id);
			}
		}
	}
	for (const dataId of dataIds) {
		const item = byId.get(dataId);
		if (item?.brick) {
			seeds.add(item.brick);
		}
		for (const step of item?.steps ?? []) {
			if (step.brick) {
				seeds.add(step.brick);
			}
		}
	}
	const chain = brickChain(map, bricks, seeds);
	const edges = new Set<string>(chain.edges);
	for (const dataId of dataIds) {
		for (const parent of byId.get(dataId)?.parents ?? []) {
			if (dataIds.has(parent)) {
				edges.add(`${parent}->${dataId}`);
			}
		}
	}
	const nodes = new Set<string>([id, ...dataIds, ...chain.bricks]);
	for (const nodeId of [...dataIds, ...chain.bricks]) {
		const owner = byId.get(nodeId)?.file ?? bricks.get(nodeId)?.file;
		if (!owner) {
			continue;
		}
		nodes.add(`file:${owner}`);
		addFolderChain(nodes, owner);
	}
	if (file !== undefined) {
		nodes.add(`file:${file}`);
		addFolderChain(nodes, file);
	}
	return { nodes, edges };
}

function collectData(map: IDroxSdtcmMap, byId: Map<string, IDroxSdtcmMap['data'][number]>, dataIds: Set<string>, dataId: string): void {
	if (!byId.has(dataId) || dataIds.has(dataId)) {
		return;
	}
	const up = [dataId];
	dataIds.add(dataId);
	for (let index = 0; index < up.length; index++) {
		for (const parent of byId.get(up[index])?.parents ?? []) {
			if (!byId.has(parent) || dataIds.has(parent)) {
				continue;
			}
			dataIds.add(parent);
			up.push(parent);
		}
	}
	const down = [dataId];
	for (let index = 0; index < down.length; index++) {
		for (const child of map.data) {
			if (!child.parents.includes(down[index]) || dataIds.has(child.id)) {
				continue;
			}
			dataIds.add(child.id);
			down.push(child.id);
		}
	}
}

/** Upstream follows only incoming links. Downstream follows only outgoing links. A neighbor's other branches stay out. */
function brickChain(map: IDroxSdtcmMap, bricks: Map<string, IDroxSdtcmMap['bricks'][number]>, seeds: ReadonlySet<string>): { bricks: Set<string>; edges: Set<string> } {
	const down = new Set<string>();
	const downQueue: string[] = [];
	for (const id of seeds) {
		if (!bricks.has(id) || down.has(id)) {
			continue;
		}
		down.add(id);
		downQueue.push(id);
	}
	for (let index = 0; index < downQueue.length; index++) {
		for (const target of bricks.get(downQueue[index])?.links ?? []) {
			if (!bricks.has(target) || down.has(target)) {
				continue;
			}
			down.add(target);
			downQueue.push(target);
		}
	}
	const up = new Set<string>(downQueue.length ? [...seeds].filter(id => bricks.has(id)) : []);
	const upQueue = [...up];
	for (let index = 0; index < upQueue.length; index++) {
		const current = upQueue[index];
		for (const other of map.bricks) {
			if (!other.links.includes(current) || up.has(other.id)) {
				continue;
			}
			up.add(other.id);
			upQueue.push(other.id);
		}
	}
	const edges = new Set<string>();
	for (const brick of map.bricks) {
		for (const target of brick.links) {
			const downstream = down.has(brick.id) && down.has(target);
			const upstream = up.has(brick.id) && up.has(target) && !down.has(brick.id);
			if (downstream || upstream) {
				edges.add(`${brick.id}->${target}`);
			}
		}
	}
	return { bricks: new Set([...up, ...down]), edges };
}

function folderOf(file: string): string {
	const parts = file.split('/');
	if (parts.length < 2) {
		return '(root)';
	}
	return parts.slice(0, -1).join('/');
}

function addFolderChain(nodes: Set<string>, file: string): void {
	let folder = folderOf(file);
	nodes.add(`folder:${folder}`);
	if (folder !== '(root)') {
		nodes.add('folder:(root)');
	}
	while (folder.includes('/')) {
		folder = folder.slice(0, folder.lastIndexOf('/'));
		nodes.add(`folder:${folder}`);
	}
}
