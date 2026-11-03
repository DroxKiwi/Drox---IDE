/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { emptyDroxSdtcmMap, IDroxSdtcmBrick, IDroxSdtcmData, IDroxSdtcmMap } from './droxSdtcmMap.js';

export type DroxSdtcmProbePhase = 'build' | 'data' | 'trace' | 'link' | 'tag';

export const DROX_SDTCM_PROBE_PHASES: readonly DroxSdtcmProbePhase[] = ['build', 'data', 'trace', 'link', 'tag'];

/** Phases a chosen step forces, because the later one reads what this one writes. */
const DROX_SDTCM_PHASE_AFTER: Readonly<Record<DroxSdtcmProbePhase, readonly DroxSdtcmProbePhase[]>> = {
	build: ['data', 'trace', 'link', 'tag'],
	data: ['trace'],
	trace: [],
	link: [],
	tag: [],
};

/** The chosen phases, plus every later phase that depends on one of them. */
export function expandDroxSdtcmPhases(selected: readonly DroxSdtcmProbePhase[]): DroxSdtcmProbePhase[] {
	const chosen = new Set(selected);
	for (const phase of DROX_SDTCM_PROBE_PHASES) {
		if (!chosen.has(phase)) {
			continue;
		}
		for (const later of DROX_SDTCM_PHASE_AFTER[phase]) {
			chosen.add(later);
		}
	}
	return DROX_SDTCM_PROBE_PHASES.filter(phase => chosen.has(phase));
}

/** Same starting map for every turn. A selected phase is cleared so the model does it again. */
export function seedDroxSdtcmProbe(map: IDroxSdtcmMap, phases: ReadonlySet<DroxSdtcmProbePhase>): IDroxSdtcmMap {
	if (phases.has('build')) {
		return emptyDroxSdtcmMap();
	}
	let bricks = phases.has('link') ? map.bricks.map(brick => ({ ...brick, links: [] as string[] })) : map.bricks;
	if (phases.has('tag')) {
		bricks = bricks.map(brick => ({ ...brick, tags: [] }));
	}
	let data = map.data;
	if (phases.has('data')) {
		data = [];
	} else if (phases.has('trace')) {
		data = map.data.map(item => ({ ...item, steps: item.steps.slice(0, 1) }));
	}
	if (phases.has('tag') && !phases.has('data')) {
		data = data.map(item => ({ ...item, tags: [] }));
	}
	return { ...map, bricks, data, placed: phases.has('tag') ? [] : map.placed };
}

/** What stayed the same, and which facts appeared in only some turns. */
export function summarizeDroxSdtcmConsistency(turns: readonly IDroxSdtcmMap[], phases: readonly DroxSdtcmProbePhase[]): string {
	const lines: string[] = [];
	lines.push('# Consistency');
	lines.push('');
	lines.push(`Phases: ${phases.join(', ') || 'none'}.`);
	lines.push(`Turns: ${turns.length}.`);
	lines.push('');
	lines.push('| Turn | Bricks | Data | Links |');
	lines.push('| --- | --- | --- | --- |');
	turns.forEach((map, index) => {
		const links = map.bricks.reduce((count, brick) => count + brick.links.length, 0);
		lines.push(`| ${index + 1} | ${map.bricks.length} | ${map.data.length} | ${links} |`);
	});
	if (turns.length < 2) {
		lines.push('');
		lines.push('One turn was kept. Nothing to compare.');
		return `${lines.join('\n')}\n`;
	}
	const brickSets = turns.map(map => new Set(map.bricks.map(brickSignature)));
	const linkSets = turns.map(map => new Set(linkSignatures(map)));
	const dataSets = turns.map(map => new Set(map.data.map(item => dataSignature(map, item))));
	lines.push('');
	lines.push(`Bricks in every turn: ${shared(brickSets)}.`);
	lines.push(`Links in every turn: ${shared(linkSets)}.`);
	lines.push(`Data in every turn: ${shared(dataSets)}.`);
	const brickDiff = divergent(brickSets);
	const linkDiff = divergent(linkSets);
	const dataDiff = divergent(dataSets);
	lines.push('');
	lines.push('## Bricks');
	lines.push(brickDiff.length ? brickDiff.join('\n') : 'No divergence.');
	lines.push('');
	lines.push('## Links');
	lines.push(linkDiff.length ? linkDiff.join('\n') : 'No divergence.');
	lines.push('');
	lines.push('## Data');
	lines.push(dataDiff.length ? dataDiff.join('\n') : 'No divergence.');
	if (phases.includes('tag')) {
		const tagSets = turns.map(map => new Set([
			...map.bricks.flatMap(brick => (brick.tags ?? []).map(mark => `${brickSignature(brick)} # ${mark.name} ${mark.reason}`)),
			...map.data.flatMap(item => (item.tags ?? []).map(mark => `data ${item.file} | ${item.line} | ${item.name} # ${mark.name} ${mark.reason}`)),
			...(map.placed ?? []).map(mark => `${mark.scope} ${mark.on} # ${mark.name} ${mark.reason}`),
		]));
		const tagDiff = divergent(tagSets);
		lines.push('');
		lines.push(`Tags in every turn: ${shared(tagSets)}.`);
		lines.push('');
		lines.push('## Tags');
		lines.push(tagDiff.length ? tagDiff.join('\n') : 'No divergence.');
	}
	lines.push('');
	return `${lines.join('\n')}\n`;
}

function brickSignature(brick: IDroxSdtcmBrick): string {
	return [brick.file, brick.line, brick.name, brick.kind, brick.form, brick.quote, [...brick.files].sort().join(',')].join(' | ');
}

function linkSignatures(map: IDroxSdtcmMap): string[] {
	const byId = new Map(map.bricks.map(brick => [brick.id, brickSignature(brick)]));
	const links: string[] = [];
	for (const brick of map.bricks) {
		for (const target of brick.links) {
			links.push(`${brickSignature(brick)} -> ${byId.get(target) ?? target}`);
		}
	}
	return links;
}

function dataSignature(map: IDroxSdtcmMap, item: IDroxSdtcmData): string {
	const bricks = new Map(map.bricks.map(brick => [brick.id, brickSignature(brick)]));
	const data = new Map(map.data.map(entry => [entry.id, `${entry.file}:${entry.line}:${entry.name}`]));
	const parents = item.parents.map(id => data.get(id) ?? id).sort().join(', ');
	const steps = item.steps.map(step => `${step.brick ? bricks.get(step.brick) ?? step.brick : 'file'}:${step.name}:${step.span}`).join(' ; ');
	return `${item.file} | ${item.line} | ${item.name} | ${item.birth} | parents ${parents} | steps ${steps}`;
}

function shared(sets: readonly ReadonlySet<string>[]): number {
	let count = 0;
	for (const value of sets[0] ?? []) {
		if (sets.every(set => set.has(value))) {
			count++;
		}
	}
	return count;
}

function divergent(sets: readonly ReadonlySet<string>[]): string[] {
	const seen = new Set<string>();
	const lines: string[] = [];
	for (const set of sets) {
		for (const value of set) {
			if (seen.has(value) || sets.every(other => other.has(value))) {
				continue;
			}
			seen.add(value);
			const present = sets.map((other, turn) => other.has(value) ? String(turn + 1) : '').filter(turn => turn.length > 0);
			lines.push(`- turns ${present.join(', ')}: ${value}`);
		}
	}
	return lines.sort();
}
