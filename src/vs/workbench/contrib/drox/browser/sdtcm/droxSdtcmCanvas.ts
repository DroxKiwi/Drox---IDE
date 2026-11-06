/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxSdtcmGraph, IDroxSdtcmGraphNode } from '../../common/sdtcm/droxSdtcmGraph.js';
import { droxSdtcmPathInMapRoot } from '../../common/sdtcm/droxSdtcmMapRoot.js';
import { IDroxSdtcmFocusMarks } from '../../common/sdtcm/focus/droxSdtcmFocus.js';

const SVG = 'http://www.w3.org/2000/svg';

export interface IDroxSdtcmCanvasHandlers {
	onEnter(node: IDroxSdtcmGraphNode, event: MouseEvent): void;
	onLeave(): void;
	onSelect(node: IDroxSdtcmGraphNode): void;
	onPressNode?(node: IDroxSdtcmGraphNode, event: PointerEvent): void;
	onGrabFolder?(node: IDroxSdtcmGraphNode, event: PointerEvent): boolean | void;
	onContextMenu?(node: IDroxSdtcmGraphNode, event: MouseEvent): void;
}

export function paintDroxSdtcmGraph(
	world: SVGGElement,
	graph: IDroxSdtcmGraph,
	selectedId: string | undefined,
	zoom: number,
	mapRoots: readonly string[],
	handlers: IDroxSdtcmCanvasHandlers,
	focus?: IDroxSdtcmFocusMarks,
): void {
	clearDroxSdtcmNode(world);
	const scale = zoom > 0 ? zoom : 1;
	const byId = new Map(graph.nodes.map(node => [node.id, node]));
	for (const node of graph.nodes) {
		if (node.kind === 'brick' || node.kind === 'data') {
			continue;
		}
		world.appendChild(paintFrame(node, selectedId, scale, mapRoots, handlers, focus?.nodes.get(node.id)));
	}
	for (const edge of graph.edges) {
		const source = byId.get(edge.from);
		const target = byId.get(edge.to);
		if (!source || !target) {
			continue;
		}
		const line = svg<SVGLineElement>('line');
		line.setAttribute('x1', String(source.x + source.w));
		line.setAttribute('y1', String(source.y + source.h / 2));
		line.setAttribute('x2', String(target.x));
		line.setAttribute('y2', String(target.y + target.h / 2));
		const edgeTone = focus?.edges.get(`${edge.from}->${edge.to}`);
		const classes = ['drox-sdtcm-edge'];
		if (edgeTone) {
			classes.push(edgeTone);
		}
		if (mapRoots.length && (!nodeInMapRoot(source, mapRoots) || !nodeInMapRoot(target, mapRoots))) {
			classes.push('quiet');
		}
		line.setAttribute('class', classes.join(' '));
		const sheen = svg<SVGLineElement>('line');
		sheen.setAttribute('x1', line.getAttribute('x1') ?? '0');
		sheen.setAttribute('y1', line.getAttribute('y1') ?? '0');
		sheen.setAttribute('x2', line.getAttribute('x2') ?? '0');
		sheen.setAttribute('y2', line.getAttribute('y2') ?? '0');
		sheen.setAttribute('pathLength', '100');
		const sheenClasses = ['drox-sdtcm-edge-sheen'];
		if (edgeTone === 'dim') {
			sheenClasses.push('dim');
		}
		if (classes.includes('quiet')) {
			sheenClasses.push('quiet');
		}
		sheen.setAttribute('class', sheenClasses.join(' '));
		world.appendChild(line);
		world.appendChild(sheen);
	}
	for (const node of graph.nodes) {
		if (node.kind !== 'brick' && node.kind !== 'data') {
			continue;
		}
		world.appendChild(paintFrame(node, selectedId, scale, mapRoots, handlers, focus?.nodes.get(node.id)));
	}
}

function nodeInMapRoot(node: IDroxSdtcmGraphNode, mapRoots: readonly string[]): boolean {
	if (node.kind === 'folder') {
		if (!node.id.startsWith('folder:') || node.id === 'folder:(root)') {
			return false;
		}
		return droxSdtcmPathInMapRoot(node.id.slice('folder:'.length), mapRoots);
	}
	return !!node.file && droxSdtcmPathInMapRoot(node.file, mapRoots);
}

function paintFrame(node: IDroxSdtcmGraphNode, selectedId: string | undefined, zoom: number, mapRoots: readonly string[], handlers: IDroxSdtcmCanvasHandlers, mark?: string): SVGGElement {
	const group = svg<SVGGElement>('g');
	const classes = ['drox-sdtcm-node', node.kind];
	if (node.id === selectedId) {
		classes.push('selected');
	}
	if (mark) {
		classes.push(mark);
	}
	if (mapRoots.length && node.kind === 'folder' && mapRoots.some(root => node.id === `folder:${root}`)) {
		classes.push('scope');
	} else if (mapRoots.length && !nodeInMapRoot(node, mapRoots)) {
		classes.push('quiet');
	}
	group.setAttribute('class', classes.join(' '));
	group.setAttribute('transform', `translate(${node.x} ${node.y})`);
	const rect = svg<SVGRectElement>('rect');
	rect.setAttribute('width', String(node.w));
	rect.setAttribute('height', String(node.h));
	rect.setAttribute('rx', '0');
	if (node.color) {
		rect.style.stroke = node.color;
	}
	group.appendChild(rect);
	const screenW = node.w * zoom;
	const screenH = node.h * zoom;
	if (screenW >= 48 && screenH >= 18) {
		const label = svg<SVGGElement>('g');
		label.setAttribute('class', 'drox-sdtcm-label');
		label.setAttribute('transform', `scale(${1 / zoom})`);
		const title = svg<SVGTextElement>('text');
		title.setAttribute('x', '8');
		title.setAttribute('y', '16');
		const chars = Math.max(4, Math.floor((screenW - 16) / 7));
		const path = node.kind === 'folder' ? (node.lines[0] || node.label) : node.label;
		title.textContent = clip(path, chars);
		label.appendChild(title);
		if (screenH >= 34 && node.lines[1]) {
			const meta = svg<SVGTextElement>('text');
			meta.setAttribute('class', 'drox-sdtcm-node-meta');
			meta.setAttribute('x', '8');
			meta.setAttribute('y', '30');
			meta.textContent = clip(node.lines[1], chars);
			label.appendChild(meta);
		}
		group.appendChild(label);
	}
	if (node.kind === 'brick' || node.kind === 'data') {
		group.addEventListener('pointerdown', event => {
			event.stopPropagation();
			handlers.onPressNode?.(node, event);
		});
	} else if (node.kind === 'file') {
		group.addEventListener('pointerdown', event => {
			event.stopPropagation();
			handlers.onPressNode?.(node, event);
		});
	} else if (node.kind === 'folder') {
		group.addEventListener('pointerdown', event => {
			if (event.button !== 0) {
				return;
			}
			event.stopPropagation();
			handlers.onGrabFolder?.(node, event);
		});
	}
	group.addEventListener('contextmenu', event => {
		event.preventDefault();
		event.stopPropagation();
		handlers.onContextMenu?.(node, event);
	});
	group.addEventListener('mouseenter', event => handlers.onEnter(node, event));
	group.addEventListener('mouseleave', () => handlers.onLeave());
	group.addEventListener('click', () => handlers.onSelect(node));
	return group;
}

export function clearDroxSdtcmNode(node: { firstChild: ChildNode | null }): void {
	while (node.firstChild) {
		node.firstChild.remove();
	}
}

function svg<T extends SVGElement>(name: string): T {
	return document.createElementNS(SVG, name) as T;
}

function clip(text: string, max: number): string {
	if (text.length <= max) {
		return text;
	}
	return `${text.slice(0, max - 1)}…`;
}
