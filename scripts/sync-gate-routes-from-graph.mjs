/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

// Sync gate routes from gate-graph.json.
// Usage: node scripts/sync-gate-routes-from-graph.mjs

const root = path.resolve(import.meta.dirname, '..');
const graphPath = path.join(
	root,
	'drox-engine/drox/crates/drox-engine/assets/gates/gate-graph.json',
);
const routesPath = path.join(
	root,
	'drox-engine/drox/crates/drox-engine/src/gate_engine/gate_routes.rs',
);
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const edges = graph.edges;
function edgeLine(e) {
	const loopComment = e.loop ? ' // loop' : '';
	return `\t\tGateRouteEdge {\n\t\t\tfrom: "${e.from}",\n\t\t\tvia: "${e.via}",\n\t\t\tto: "${e.to}",\n\t\t},${loopComment}`;
}
const edgesBlock = edges.map(edgeLine).join('\n');
const src = fs.readFileSync(routesPath, 'utf8');
const startMarker = 'pub const fn embedded_route_edges() -> \'&\'static [GateRouteEdge] {\n\t&[';
const endMarker = '\n\t]\n}';
const startIdx = src.indexOf(startMarker);
const endIdx = src.indexOf(endMarker, startIdx);
if (startIdx === -1 || endIdx === -1) {
	console.error('Could not find embedded_route_edges block in gate_routes.rs');
	process.exit(1);
}
const newSrc =
	src.slice(0, startIdx + startMarker.length) +
	'\n' +
	edgesBlock +
	src.slice(endIdx);
fs.writeFileSync(routesPath, newSrc);
console.log(`Updated ${routesPath} (${edges.length} edges from gate-graph.json)`);
