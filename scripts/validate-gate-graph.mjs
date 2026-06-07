/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

// Validate gate-graph.json structure (no Rust required).
// Usage: node scripts/validate-gate-graph.mjs

const root = path.resolve(import.meta.dirname, '..');
const graphPath = path.join(
	root,
	'drox-engine/drox/crates/drox-engine/assets/gates/gate-graph.json',
);
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
let errors = 0;
function err(msg) {
	console.error('ERROR:', msg);
	errors++;
}
const nodeIds = new Set(Object.keys(graph.nodes));
const startRuns = new Set(Object.keys(graph.start_runs || {}));
for (const e of graph.edges) {
	if (!nodeIds.has(e.from) && e.from !== graph.entry_gate_id) {
		err(`edge.from unknown node: ${e.from}`);
	}
	if (!e.to.startsWith('START_RUN.')) {
		if (!nodeIds.has(e.to)) {
			err(`edge.to unknown node: ${e.to}`);
		}
	} else if (!startRuns.has(e.to)) {
		err(`edge.to unknown start_run: ${e.to}`);
	}
}
for (const [id, node] of Object.entries(graph.nodes)) {
	for (const t of node.transitions || []) {
		const match = graph.edges.find(
			(e) => e.from === id && e.via === t.via && e.to === t.to,
		);
		if (!match) {
			err(`node ${id} transition ${t.via}→${t.to} missing in edges[]`);
		}
	}
}
const edgeSet = new Set(graph.edges.map((e) => `${e.from}|${e.via}|${e.to}`));
for (const e of graph.edges) {
	const key = `${e.from}|${e.via}|${e.to}`;
	if ([...edgeSet].filter((k) => k === key).length > 1) {
		err(`duplicate edge: ${key}`);
	}
}
if (errors > 0) {
	console.error(`\n${errors} validation error(s)`);
	process.exit(1);
}
console.log('gate-graph.json OK', `(${graph.edges.length} edges, ${nodeIds.size} nodes)`);
