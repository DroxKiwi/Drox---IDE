/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { DroxSdtcmForm, DroxSdtcmKind, droxSdtcmBrickLabel, IDroxSdtcmMap, IDroxSdtcmTagMark } from './droxSdtcmMap.js';

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
	readonly color?: string;
	readonly marks?: readonly IDroxSdtcmTagMark[];
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
	readonly color?: string;
	readonly marks?: readonly IDroxSdtcmTagMark[];
}

const PAD = 14;
const GAP = 8;
const HEADER = 28;
const DATA_H = 44;

export interface IDroxSdtcmGraphFilter {
	readonly kinds: ReadonlySet<DroxSdtcmKind>;
	readonly forms: ReadonlySet<DroxSdtcmForm>;
	readonly links: boolean;
	readonly tags?: ReadonlySet<string>;
	readonly tagColors?: ReadonlyMap<string, string>;
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
	const directFiles = new Map<string, string[]>();
	for (const file of paths) {
		const folder = folderOf(file);
		const list = directFiles.get(folder);
		if (list) {
			list.push(file);
		} else {
			directFiles.set(folder, [file]);
		}
	}
	const folderPaths = new Set<string>();
	for (const folder of directFiles.keys()) {
		let current: string | undefined = folder;
		while (current) {
			folderPaths.add(current);
			const slash = current.lastIndexOf('/');
			current = current === '(root)' ? undefined : slash === -1 ? undefined : current.slice(0, slash);
		}
	}
	if (!folderPaths.size) {
		return { nodes: [], edges: [] };
	}
	const nodes = rootsOf(folderPaths).sort().flatMap(folder => layoutFolder(folder, folderPaths, directFiles, byFile, map, filter));
	const edges: IDroxSdtcmGraphEdge[] = [];
	if (filter && !filter.links) {
		return { nodes, edges };
	}
	const dataAt = new Set(nodes.filter(node => node.kind === 'data').map(node => node.id));
	const brickIds = new Set(nodes.filter(node => node.kind === 'brick').map(node => node.id));
	const seen = new Set<string>();
	for (const member of members) {
		for (const target of member.links) {
			if (!brickIds.has(member.id) || !brickIds.has(target)) {
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
	for (const item of map.data) {
		if (!dataAt.has(item.id)) {
			continue;
		}
		for (const parent of item.parents) {
			if (!dataAt.has(parent)) {
				continue;
			}
			const key = `${parent}->${item.id}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			edges.push({ from: parent, to: item.id });
		}
	}
	return { nodes, edges };
}

/** Parent folder id when that frame exists. `src/app` sits in `src`, and `src` sits in `(root)` when the root has files. */
export function droxSdtcmParentFolderId(id: string, present: ReadonlySet<string>): string | undefined {
	if (!id.startsWith('folder:')) {
		return undefined;
	}
	const path = id.slice('folder:'.length);
	if (path === '(root)') {
		return undefined;
	}
	const slash = path.lastIndexOf('/');
	const parent = slash === -1 ? 'folder:(root)' : `folder:${path.slice(0, slash)}`;
	return present.has(parent) ? parent : undefined;
}

function rootsOf(folderPaths: ReadonlySet<string>): string[] {
	const present = new Set([...folderPaths].map(folder => `folder:${folder}`));
	return [...folderPaths].filter(folder => !droxSdtcmParentFolderId(`folder:${folder}`, present));
}

function layoutFolder(folder: string, folderPaths: ReadonlySet<string>, directFiles: ReadonlyMap<string, string[]>, byFile: ReadonlyMap<string, IMember[]>, map: IDroxSdtcmMap, filter?: IDroxSdtcmGraphFilter): IDroxSdtcmGraphNode[] {
	const folderId = `folder:${folder}`;
	const present = new Set([...folderPaths].map(path => `folder:${path}`));
	const blocks: { name: string; h: number; w: number; nodes: IDroxSdtcmGraphNode[] }[] = [];
	for (const file of (directFiles.get(folder) ?? []).sort()) {
		const nodes = layoutFile(file, folderId, byFile.get(file) ?? [], map, filter);
		const fileNode = nodes.find(node => node.kind === 'file');
		if (fileNode) {
			blocks.push({ name: fileNode.label, h: fileNode.h, w: fileNode.w, nodes });
		}
	}
	for (const child of [...folderPaths].filter(path => droxSdtcmParentFolderId(`folder:${path}`, present) === folderId).sort()) {
		const nodes = layoutFolder(child, folderPaths, directFiles, byFile, map, filter);
		const childNode = nodes.find(node => node.id === `folder:${child}`);
		if (childNode) {
			blocks.push({ name: childNode.label, h: childNode.h, w: childNode.w, nodes });
		}
	}
	blocks.sort((a, b) => a.name.localeCompare(b.name));
	const packed = packSquare(blocks);
	const content = packed.nodes.map(node => ({ ...node, x: node.x + PAD, y: node.y + HEADER + PAD }));
	const fileCount = (directFiles.get(folder) ?? []).length;
	const folderMarks = (map.placed ?? []).filter(mark => mark.scope === 'folder' && mark.on === folder);
	const folderNode: IDroxSdtcmGraphNode = {
		id: folderId,
		label: folder === '(root)' ? folder : folder.split('/').pop() || folder,
		kind: 'folder',
		folder: folderId,
		x: 0,
		y: 0,
		w: Math.max(DROX_SDTCM_NODE_W, packed.w) + PAD * 2,
		h: HEADER + PAD + packed.h + PAD,
		lines: [folder, `${fileCount} file(s)`],
		color: markColor(folderMarks, filter?.tagColors),
		marks: folderMarks,
	};
	return [folderNode, ...content];
}

function layoutFile(file: string, folderId: string, bricks: readonly IMember[], map: IDroxSdtcmMap, filter?: IDroxSdtcmGraphFilter): IDroxSdtcmGraphNode[] {
	const colors = filter?.tagColors;
	const blocks: IPackedBlock[] = [];
	for (const item of map.data.filter(entry => entry.file === file && !entry.brick && marksShown(entry.tags, filter))) {
		blocks.push({
			name: item.name,
			w: DROX_SDTCM_NODE_W,
			h: DATA_H,
			nodes: [{
				id: item.id,
				label: item.name,
				kind: 'data',
				x: 0,
				y: 0,
				w: DROX_SDTCM_NODE_W,
				h: DATA_H,
				lines: [item.name, item.birth, `${item.line}`],
				file,
				line: item.line,
				folder: folderId,
				color: markColor(item.tags, colors),
				marks: item.tags ?? [],
			}],
		});
	}
	for (const brick of bricks) {
		const born = map.data.filter(item => item.brick === brick.id && marksShown(item.tags, filter));
		const node: IDroxSdtcmGraphNode = {
			id: brick.id,
			label: brick.name,
			kind: 'brick',
			x: 0,
			y: 0,
			w: DROX_SDTCM_NODE_W,
			h: brickBoxHeight(born.length),
			lines: [brick.name, brick.role, `${brick.file}:${brick.line}`, brick.quote],
			file: brick.file,
			line: brick.line,
			folder: folderId,
			color: brick.color,
			marks: brick.marks,
		};
		const nodes = [node];
		born.forEach((item, index) => {
			nodes.push({
				id: item.id,
				label: item.name,
				kind: 'data',
				x: 8,
				y: DROX_SDTCM_NODE_H + index * (DATA_H + 4),
				w: node.w - 16,
				h: DATA_H,
				lines: [item.name, item.birth, `${item.line}`],
				file: brick.file,
				line: item.line,
				folder: folderId,
				color: markColor(item.tags, colors) ?? brick.color,
				marks: item.tags ?? [],
			});
		});
		blocks.push({ name: brick.name, w: node.w, h: node.h, nodes });
	}
	blocks.sort((a, b) => a.name.localeCompare(b.name));
	const packed = packSquare(blocks);
	const inner = packed.nodes.map(node => ({ ...node, x: node.x + PAD, y: node.y + HEADER + PAD }));
	const fileMarks = (map.placed ?? []).filter(mark => mark.scope === 'file' && mark.on === file);
	const fileNode: IDroxSdtcmGraphNode = {
		id: `file:${file}`,
		label: file.split('/').pop() || file,
		kind: 'file',
		x: 0,
		y: 0,
		w: Math.max(DROX_SDTCM_NODE_W, packed.w) + PAD * 2,
		h: blocks.length ? HEADER + PAD + packed.h + PAD : HEADER + PAD + 18,
		lines: [file, bricks.length ? `${bricks.length} brick(s)` : 'no brick'],
		file,
		line: 1,
		folder: folderId,
		color: markColor(fileMarks, colors),
		marks: fileMarks,
	};
	return [fileNode, ...inner];
}

interface IPackedBlock {
	readonly name: string;
	readonly w: number;
	readonly h: number;
	readonly nodes: readonly IDroxSdtcmGraphNode[];
}

/** Rows wrapped so the bounding box stays as close to a square as the blocks allow. */
function packSquare(blocks: readonly IPackedBlock[]): { nodes: IDroxSdtcmGraphNode[]; w: number; h: number } {
	if (!blocks.length) {
		return { nodes: [], w: 0, h: 0 };
	}
	const widest = blocks.reduce((max, block) => Math.max(max, block.w), 0);
	const targets = new Set<number>([widest]);
	let area = 0;
	let running = 0;
	for (const block of blocks) {
		area += block.w * block.h;
		running += block.w + GAP;
		targets.add(Math.max(widest, running - GAP));
	}
	targets.add(Math.max(widest, Math.sqrt(area)));
	let best: { nodes: IDroxSdtcmGraphNode[]; w: number; h: number; score: number } | undefined;
	for (const target of targets) {
		const packed = packRows(blocks, target);
		const score = packed.h === 0 ? packed.w : Math.max(packed.w / packed.h, packed.h / packed.w);
		if (!best || score < best.score) {
			best = { ...packed, score };
		}
	}
	return best ?? { nodes: [], w: 0, h: 0 };
}

function packRows(blocks: readonly IPackedBlock[], target: number): { nodes: IDroxSdtcmGraphNode[]; w: number; h: number } {
	const nodes: IDroxSdtcmGraphNode[] = [];
	let x = 0;
	let y = 0;
	let rowH = 0;
	let usedW = 0;
	for (const block of blocks) {
		if (x > 0 && x + block.w > target) {
			y += rowH + GAP;
			x = 0;
			rowH = 0;
		}
		for (const node of block.nodes) {
			nodes.push({ ...node, x: node.x + x, y: node.y + y });
		}
		x += block.w + GAP;
		rowH = Math.max(rowH, block.h);
		usedW = Math.max(usedW, x - GAP);
	}
	return { nodes, w: usedW, h: y + rowH };
}

function brickBoxHeight(born: number): number {
	if (!born) {
		return DROX_SDTCM_NODE_H;
	}
	return DROX_SDTCM_NODE_H + born * (DATA_H + 4) + 4;
}

function listMembers(map: IDroxSdtcmMap, filter?: IDroxSdtcmGraphFilter): IMember[] {
	return map.bricks.filter(brick => brickVisible(brick, filter)).map(brick => ({
		id: brick.id,
		file: brick.file,
		name: brick.name,
		role: droxSdtcmBrickLabel(brick),
		line: brick.line,
		quote: brick.quote,
		links: brick.links,
		color: markColor(brick.tags, filter?.tagColors),
		marks: brick.tags ?? [],
	}));
}

function brickVisible(brick: { kind: DroxSdtcmKind; form: DroxSdtcmForm; tags?: readonly IDroxSdtcmTagMark[] }, filter?: IDroxSdtcmGraphFilter): boolean {
	if (!filter) {
		return true;
	}
	if (!filter.kinds.has(brick.kind) || !filter.forms.has(brick.form)) {
		return false;
	}
	return marksShown(brick.tags, filter);
}

function marksShown(marks: readonly IDroxSdtcmTagMark[] | undefined, filter?: IDroxSdtcmGraphFilter): boolean {
	const tags = marks ?? [];
	if (!filter?.tags || !tags.length) {
		return true;
	}
	return tags.some(mark => filter.tags?.has(mark.name));
}

function markColor(marks: readonly IDroxSdtcmTagMark[] | undefined, colors?: ReadonlyMap<string, string>): string | undefined {
	for (const mark of marks ?? []) {
		const color = colors?.get(mark.name);
		if (color) {
			return color;
		}
	}
	return undefined;
}

function folderOf(file: string): string {
	const parts = file.split('/');
	if (parts.length < 2) {
		return '(root)';
	}
	return parts.slice(0, -1).join('/');
}

