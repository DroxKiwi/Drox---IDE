/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { DroxSdtcmForm, DroxSdtcmKind, droxSdtcmBrickLabel, IDroxSdtcmMap } from './droxSdtcmMap.js';

export type DroxSdtcmDetail = 'folder' | 'file' | 'brick' | 'data';

export const DROX_SDTCM_NODE_W = 168;
export const DROX_SDTCM_NODE_H = 46;

export interface IDroxSdtcmGraphNode {
	readonly id: string;
	readonly label: string;
	readonly kind: DroxSdtcmDetail;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
	readonly lines: readonly string[];
	readonly file?: string;
	readonly line?: number;
	readonly folder?: string;
}

export interface IDroxSdtcmGraphEdge {
	readonly from: string;
	readonly to: string;
}

export interface IDroxSdtcmGraph {
	readonly nodes: readonly IDroxSdtcmGraphNode[];
	readonly edges: readonly IDroxSdtcmGraphEdge[];
}

interface IMember {
	readonly id: string;
	readonly file: string;
	readonly name: string;
	readonly role: string;
	readonly line: number;
	readonly quote: string;
	readonly links: readonly string[];
}

const PAD = 14;
const GAP = 8;
const HEADER = 28;
const DATA_H = 44;

export interface IDroxSdtcmGraphFilter {
	readonly kinds: ReadonlySet<DroxSdtcmKind>;
	readonly forms: ReadonlySet<DroxSdtcmForm>;
	readonly links: boolean;
}

export function buildDroxSdtcmGraph(map: IDroxSdtcmMap, files: readonly string[] = [], filter?: IDroxSdtcmGraphFilter): IDroxSdtcmGraph {
	const members = listMembers(map, filter);
	const byFile = new Map<string, IMember[]>();
	for (const member of members) {
		const list = byFile.get(member.file);
		if (list) {
			list.push(member);
		} else {
			byFile.set(member.file, [member]);
		}
	}
	const paths = new Set<string>([...files, ...byFile.keys()]);
	const folders = new Map<string, string[]>();
	for (const file of paths) {
		const folder = folderOf(file);
		const list = folders.get(folder);
		if (list) {
			list.push(file);
		} else {
			folders.set(folder, [file]);
		}
	}
	if (!folders.size) {
		return { nodes: [], edges: [] };
	}
	const nodes: IDroxSdtcmGraphNode[] = [];
	const brickAt = new Map<string, IDroxSdtcmGraphNode>();
	for (const folder of [...folders.keys()].sort()) {
		const folderId = `folder:${folder}`;
		const filePaths = (folders.get(folder) ?? []).sort();
		const fileNodes: IDroxSdtcmGraphNode[] = [];
		let innerY = HEADER + PAD;
		let innerW = DROX_SDTCM_NODE_W;
		for (const file of filePaths) {
			const bricks = byFile.get(file) ?? [];
			const fileH = fileHeight(bricks, map);
			const fileNode: IDroxSdtcmGraphNode = {
				id: `file:${file}`,
				label: file.split('/').pop() || file,
				kind: 'file',
				x: PAD,
				y: innerY,
				w: DROX_SDTCM_NODE_W + PAD * 2,
				h: fileH,
				lines: [file, bricks.length ? `${bricks.length} brick(s)` : 'no brick'],
				file,
				line: 1,
				folder: folderId,
			};
			fileNodes.push(fileNode);
			let cursor = fileNode.y + HEADER + PAD;
			const loose = map.data.filter(item => item.file === file && !item.brick);
			for (const item of loose) {
				nodes.push({
					id: item.id,
					label: item.name,
					kind: 'data',
					x: fileNode.x + PAD,
					y: cursor,
					w: DROX_SDTCM_NODE_W,
					h: DATA_H,
					lines: [item.name, item.birth, `${item.line}`],
					file,
					line: item.line,
					folder: folderId,
				});
				cursor += DATA_H + GAP;
			}
			for (const brick of bricks) {
				const born = map.data.filter(item => item.brick === brick.id);
				const node: IDroxSdtcmGraphNode = {
					id: brick.id,
					label: brick.name,
					kind: 'brick',
					x: fileNode.x + PAD,
					y: cursor,
					w: DROX_SDTCM_NODE_W,
					h: brickBoxHeight(born.length),
					lines: [brick.name, brick.role, `${brick.file}:${brick.line}`, brick.quote],
					file: brick.file,
					line: brick.line,
					folder: folderId,
				};
				brickAt.set(brick.id, node);
				nodes.push(node);
				born.forEach((item, index) => {
					nodes.push({
						id: item.id,
						label: item.name,
						kind: 'data',
						x: node.x + 8,
						y: node.y + DROX_SDTCM_NODE_H + index * (DATA_H + 4),
						w: node.w - 16,
						h: DATA_H,
						lines: [item.name, item.birth, `${item.line}`],
						file: brick.file,
						line: item.line,
						folder: folderId,
					});
				});
				cursor += node.h + GAP;
			}
			innerW = Math.max(innerW, fileNode.w);
			innerY += fileH + GAP;
		}
		const folderNode: IDroxSdtcmGraphNode = {
			id: folderId,
			label: folder,
			kind: 'folder',
			folder: folderId,
			x: 0,
			y: 0,
			w: innerW + PAD * 2,
			h: innerY + PAD - GAP,
			lines: [folder, `${filePaths.length} file(s)`],
		};
		nodes.push(folderNode, ...fileNodes);
	}
	const edges: IDroxSdtcmGraphEdge[] = [];
	if (filter && !filter.links) {
		return { nodes, edges };
	}
	const seen = new Set<string>();
	for (const member of members) {
		for (const target of member.links) {
			if (!brickAt.has(member.id) || !brickAt.has(target)) {
				continue;
			}
			const key = `${member.id}->${target}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			edges.push({ from: member.id, to: target });
		}
	}
	return { nodes, edges };
}

function brickBoxHeight(born: number): number {
	if (!born) {
		return DROX_SDTCM_NODE_H;
	}
	return DROX_SDTCM_NODE_H + born * (DATA_H + 4) + 4;
}

function fileHeight(bricks: readonly IMember[], map: IDroxSdtcmMap): number {
	if (!bricks.length) {
		return HEADER + PAD + 18;
	}
	const file = bricks[0].file;
	const loose = map.data.filter(item => item.file === file && !item.brick).length;
	let body = PAD + loose * (DATA_H + GAP);
	for (const brick of bricks) {
		const born = map.data.filter(item => item.brick === brick.id).length;
		body += brickBoxHeight(born) + GAP;
	}
	return HEADER + body + PAD - GAP;
}

function listMembers(map: IDroxSdtcmMap, filter?: IDroxSdtcmGraphFilter): IMember[] {
	return map.bricks.filter(brick => !filter || (filter.kinds.has(brick.kind) && filter.forms.has(brick.form))).map(brick => ({
		id: brick.id,
		file: brick.file,
		name: brick.name,
		role: droxSdtcmBrickLabel(brick),
		line: brick.line,
		quote: brick.quote,
		links: brick.links,
	}));
}

function folderOf(file: string): string {
	const parts = file.split('/');
	if (parts.length < 2) {
		return '(root)';
	}
	return parts.slice(0, -1).join('/');
}

