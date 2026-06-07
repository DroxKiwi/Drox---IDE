/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

// Split core/00-context.js into core/* modules.
// Usage: node scripts/split-00-context.mjs

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/core/00-context.js',
);
const coreDir = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/core',
);
const header = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file
`;
const bootstrapFooter = `})(typeof globalThis !== "undefined" ? globalThis : window);
`;
const moduleFooter = `})(globalThis.DroxChat);
`;
const segments = [
	{
		out: '00-bootstrap.js',
		wrap: 'bootstrap',
		ranges: [[8, 10]],
	},
	{
		out: 'dom.js',
		wrap: 'module',
		ranges: [[11, 88]],
	},
	{
		out: 'constants-modes.js',
		wrap: 'module',
		ranges: [[89, 97]],
	},
	{
		out: 'state.js',
		wrap: 'module',
		ranges: [[98, 191]],
	},
	{
		out: 'warmup-phrases.js',
		wrap: 'module',
		ranges: [[192, 594]],
	},
	{
		out: 'constants-meta.js',
		wrap: 'module',
		ranges: [[595, 633]],
	},
];
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');
function extractBody([from, to]) {
	return lines.slice(from - 1, to).join('\n');
}
for (const seg of segments) {
	const body = seg.ranges.map((r) => extractBody(r)).join('\n');
	const outPath = path.join(coreDir, seg.out);
	let content;
	if (seg.wrap === 'bootstrap') {
		// Keep opening IIFE from source; replace closing with bootstrap-only close.
		content = header + body + '\n' + bootstrapFooter;
	} else {
		content = header + '(function (D) {\n' + body + '\n' + moduleFooter;
	}
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, content);
	console.log('wrote core/' + seg.out, `(${body.split('\n').length} lines)`);
}
fs.unlinkSync(srcPath);
console.log('removed', srcPath);
