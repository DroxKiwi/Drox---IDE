/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxSdtcmGraph, IDroxSdtcmGraphNode } from '../../common/sdtcm/droxSdtcmGraph.js';
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
	handlers: IDroxSdtcmCanvasHandlers,
	focus?: IDroxSdtcmFocusMarks,
): void {
	clearDroxSdtcmNode(world);
	const byId = new Map(graph.nodes.map(node => [node.id, node]));
	for (const node of graph.nodes) {
		if (node.kind === 'brick' || node.kind === 'data') {
			continue;
		}
		world.appendChild(paintFrame(node, selectedId, handlers, focus?.nodes.get(node.id)));
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
		line.setAttribute('class', classes.join(' '));
		const sheen = svg<SVGLineElement>('line');
		sheen.setAttribute('x1', line.getAttribute('x1') ?? '0');
		sheen.setAttribute('y1', line.getAttribute('y1') ?? '0');
		sheen.setAttribute('x2', line.getAttribute('x2') ?? '0');
		sheen.setAttribute('y2', line.getAttribute('y2') ?? '0');
		sheen.setAttribute('pathLength', '100');
		sheen.setAttribute('class', edgeTone === 'dim' ? 'drox-sdtcm-edge-sheen dim' : 'drox-sdtcm-edge-sheen');
		world.appendChild(line);
		world.appendChild(sheen);
	}
	for (const node of graph.nodes) {
		if (node.kind !== 'brick' && node.kind !== 'data') {
			continue;
		}
		world.appendChild(paintFrame(node, selectedId, handlers, focus?.nodes.get(node.id)));
	}
}

function paintFrame(node: IDroxSdtcmGraphNode, selectedId: string | undefined, handlers: IDroxSdtcmCanvasHandlers, mark?: string): SVGGElement {
	const group = svg<SVGGElement>('g');
	const classes = ['drox-sdtcm-node', node.kind];
	if (node.id === selectedId) {
		classes.push('selected');
	}
	if (mark) {
		classes.push(mark);
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
	const title = svg<SVGTextElement>('text');
	title.setAttribute('x', '10');
	title.setAttribute('y', node.kind === 'data' ? '19' : node.kind === 'brick' ? '20' : '18');
	title.textContent = clip(node.label, Math.max(8, Math.floor(node.w / 8)));
	group.appendChild(rect);
	group.appendChild(title);
	if (node.kind === 'brick' || node.kind === 'data') {
		const meta = svg<SVGTextElement>('text');
		meta.setAttribute('class', 'drox-sdtcm-node-meta');
		meta.setAttribute('x', '10');
		meta.setAttribute('y', node.kind === 'data' ? '32' : '36');
		meta.textContent = clip(node.lines[1] ?? '', 26);
		group.appendChild(meta);
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
