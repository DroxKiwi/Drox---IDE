/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

// Split stream/09-host.js into stream/host/* modules.
// Usage: node scripts/split-09-host.mjs

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/bridge/09-host.js',
);
const outDir = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/bridge',
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
	{ out: 'tool-events.js', ranges: [[10, 51]] },
	{ out: 'abort.js', ranges: [[53, 80]] },
	{ out: 'send-button.js', ranges: [[82, 89]] },
	{ out: 'host-message.js', ranges: [[91, 455]] },
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
	console.log('wrote bridge/' + seg.out, `(${body.split('\n').length} lines)`);
}
fs.unlinkSync(srcPath);
console.log('removed', srcPath);
