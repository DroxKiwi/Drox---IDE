/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

// Split chrome/02-chrome.js into chrome/* modules.
// Usage: node scripts/split-02-chrome.mjs

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/chrome/02-chrome.js',
);
const outDir = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/chrome',
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
	{ out: 'util.js', ranges: [[10, 12]] },
	{ out: 'composer-chrome.js', ranges: [[14, 92]] },
	{ out: 'phase-labels.js', ranges: [[94, 131]] },
	{ out: 'architect-tail.js', ranges: [[133, 219]] },
	{ out: 'busy.js', ranges: [[221, 254]] },
	{ out: 'activity.js', ranges: [[256, 411]] },
	{ out: 'todos.js', ranges: [[413, 519]] },
];
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');
function extractBody([from, to]) {
	return lines.slice(from - 1, to).join('\n');
}
for (const seg of segments) {
	const body = seg.ranges.map((r) => extractBody(r)).join('\n');
	const outPath = path.join(outDir, seg.out);
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, header + fnOpen + body + '\n' + footer);
	console.log('wrote chrome/' + seg.out, `(${body.split('\n').length} lines)`);
}
fs.unlinkSync(srcPath);
console.log('removed', srcPath);
