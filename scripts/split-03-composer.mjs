/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

// Split composer/03-composer.js into composer/* modules.
// Usage: node scripts/split-03-composer.mjs

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/composer/03-composer.js',
);
const outDir = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/composer',
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
	{ out: 'pending.js', ranges: [[10, 100]] },
	{ out: 'helpers.js', ranges: [[102, 145]] },
	{ out: 'refs.js', ranges: [[147, 212]] },
	{ out: 'path-complete.js', ranges: [[214, 332]] },
	{ out: 'payload.js', ranges: [[334, 470]] },
	{ out: 'send.js', ranges: [[472, 613]] },
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
	console.log('wrote composer/' + seg.out, `(${body.split('\n').length} lines)`);
}
fs.unlinkSync(srcPath);
console.log('removed', srcPath);
