/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

// Split stream/07b-runTimeline.js into stream/timeline/* modules.
// Usage: node scripts/split-07b-runTimeline.mjs
// Fil lineaire append-only : plan, work, thinking, answer (pas de promotion Exploring).

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/stream/07b-runTimeline.js',
);
const timelineDir = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/stream/timeline',
);
const header = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file
`;
const fnOpen = `(function (D) {
\tconst fn = D.fn;
`;
const footer = `})(globalThis.DroxChat);
`;
const segments = [
	{ out: 'strip.js', ranges: [[12, 405]] },
	{ out: 'thinking.js', ranges: [[407, 580], [683, 710]] },
	{ out: 'architect-rail.js', ranges: [[582, 681]] },
	{ out: 'mount.js', ranges: [[711, 731]] },
	{ out: 'overrides.js', ranges: [[733, 1104]] },
];
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');
function extractBody([from, to]) {
	return lines.slice(from - 1, to).join('\n');
}
for (const seg of segments) {
	const body = seg.ranges.map((r) => extractBody(r)).join('\n');
	const outPath = path.join(timelineDir, seg.out);
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, header + fnOpen + body + '\n' + footer);
	console.log('wrote timeline/' + seg.out, `(${body.split('\n').length} lines)`);
}
fs.unlinkSync(srcPath);
console.log('removed', srcPath);
