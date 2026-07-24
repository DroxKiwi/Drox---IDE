/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILocalGitCommit } from '../../../../../platform/git/common/localGitService.js';

/** Horizontal spacing between branch swimlanes (Git Graph–style indentation). */
export const DROX_GIT_GRAPH_LANE_WIDTH = 22;
export const DROX_GIT_GRAPH_ROW_HEIGHT = 28;

export interface IDroxGitGraphEdge {
	readonly fromLane: number;
	readonly toLane: number;
	readonly colorIndex: number;
	/** Path starts at the top of the row or at the commit node. */
	readonly from: 'top' | 'node';
	/** Path ends at the bottom of the row or at the commit node. */
	readonly to: 'bottom' | 'node';
}

export interface IDroxGitGraphLayoutRow {
	readonly hash: string;
	readonly lane: number;
	readonly colorIndex: number;
	readonly laneCount: number;
	readonly edges: readonly IDroxGitGraphEdge[];
}

interface IOpenLane {
	/** Next commit hash expected on this lane (walking newest → older). */
	readonly hash: string;
	readonly colorIndex: number;
}

/**
 * Assigns swimlanes + per-branch colors for a date-ordered commit list (newest first).
 * Parallel branches indent to the right; each new branch stream gets a fresh color.
 */
export function computeDroxGitGraphLayout(commits: readonly ILocalGitCommit[]): readonly IDroxGitGraphLayoutRow[] {
	const rows: IDroxGitGraphLayoutRow[] = [];
	let openLanes: (IOpenLane | undefined)[] = [];
	let nextColor = 0;

	const allocColor = (): number => nextColor++;

	const findFreeLane = (lanes: (IOpenLane | undefined)[]): number => {
		const free = lanes.findIndex(l => l === undefined);
		if (free >= 0) {
			return free;
		}
		return lanes.length;
	};

	for (const commit of commits) {
		const edges: IDroxGitGraphEdge[] = [];

		// Lanes already waiting for this commit (converging children).
		const waiting: number[] = [];
		for (let i = 0; i < openLanes.length; i++) {
			if (openLanes[i]?.hash === commit.hash) {
				waiting.push(i);
			}
		}

		let lane: number;
		let colorIndex: number;

		if (waiting.length === 0) {
			// New tip (branch head not yet reached from a child in the window).
			lane = findFreeLane(openLanes);
			colorIndex = allocColor();
			while (openLanes.length <= lane) {
				openLanes.push(undefined);
			}
		} else {
			lane = waiting[0]!;
			colorIndex = openLanes[lane]!.colorIndex;
			// Converge other waiting lanes into this commit.
			for (let w = 1; w < waiting.length; w++) {
				const fromLane = waiting[w]!;
				edges.push({
					fromLane,
					toLane: lane,
					colorIndex: openLanes[fromLane]!.colorIndex,
					from: 'top',
					to: 'node',
				});
			}
		}

		// Pass-through for unrelated active lanes (top → bottom).
		for (let i = 0; i < openLanes.length; i++) {
			if (openLanes[i] && openLanes[i]!.hash !== commit.hash) {
				edges.push({
					fromLane: i,
					toLane: i,
					colorIndex: openLanes[i]!.colorIndex,
					from: 'top',
					to: 'bottom',
				});
			}
		}

		// Incoming vertical from top on the commit lane (when we were expected).
		if (waiting.length > 0) {
			edges.push({
				fromLane: lane,
				toLane: lane,
				colorIndex,
				from: 'top',
				to: 'node',
			});
		}

		const nextLanes: (IOpenLane | undefined)[] = openLanes.slice();
		for (const w of waiting) {
			nextLanes[w] = undefined;
		}
		if (waiting.length === 0) {
			// Ensure slot exists then clear (was empty / newly allocated).
			while (nextLanes.length <= lane) {
				nextLanes.push(undefined);
			}
			nextLanes[lane] = undefined;
		}

		const parents = commit.parents;
		if (parents.length > 0) {
			const first = parents[0]!;
			const existingFirst = nextLanes.findIndex(l => l?.hash === first);
			if (existingFirst >= 0 && existingFirst !== lane) {
				// Join first-parent already on another lane.
				edges.push({
					fromLane: lane,
					toLane: existingFirst,
					colorIndex: nextLanes[existingFirst]!.colorIndex,
					from: 'node',
					to: 'bottom',
				});
			} else {
				// Continue first-parent on this lane (same branch color).
				nextLanes[lane] = { hash: first, colorIndex };
				edges.push({
					fromLane: lane,
					toLane: lane,
					colorIndex,
					from: 'node',
					to: 'bottom',
				});
			}

			// Additional parents → new branch streams (or join existing).
			for (let p = 1; p < parents.length; p++) {
				const parent = parents[p]!;
				let mergeLane = nextLanes.findIndex(l => l?.hash === parent);
				let mergeColor: number;
				if (mergeLane < 0) {
					mergeLane = findFreeLane(nextLanes);
					mergeColor = allocColor();
					while (nextLanes.length <= mergeLane) {
						nextLanes.push(undefined);
					}
					nextLanes[mergeLane] = { hash: parent, colorIndex: mergeColor };
				} else {
					mergeColor = nextLanes[mergeLane]!.colorIndex;
				}
				edges.push({
					fromLane: lane,
					toLane: mergeLane,
					colorIndex: mergeColor,
					from: 'node',
					to: 'bottom',
				});
			}
		}

		while (nextLanes.length > 0 && nextLanes[nextLanes.length - 1] === undefined) {
			nextLanes.pop();
		}

		const laneCount = Math.max(openLanes.length, nextLanes.length, lane + 1);
		rows.push({
			hash: commit.hash,
			lane,
			colorIndex,
			laneCount,
			edges,
		});
		openLanes = nextLanes;
	}

	return rows;
}

/** Distinct hex palette so parallel branches stay readable (Git Graph–like). */
export function droxGitGraphLaneColor(colorIndex: number): string {
	const palette = [
		'#3794ff', // blue
		'#b180d7', // purple
		'#89d185', // green
		'#d18616', // orange
		'#f14c4c', // red
		'#cca700', // yellow
		'#00b7c3', // teal
		'#e645a0', // pink
		'#6b9bff', // light blue
		'#c586c0', // mauve
		'#4ec9b0', // mint
		'#ce9178', // rust
	];
	return palette[((colorIndex % palette.length) + palette.length) % palette.length]!;
}
