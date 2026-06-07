/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

// Split core/01c-role-models.js into core/role-models/* modules.
// Usage: node scripts/split-01c-role-models.mjs

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/settings/01c-role-models.js',
);
const outDir = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/settings/role-models',
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
	{ out: 'state.js', ranges: [[11, 28]] },
	{ out: 'helpers.js', ranges: [[30, 167]] },
	{ out: 'panel.js', ranges: [[170, 322]] },
	{ out: 'persist.js', ranges: [[324, 467]] },
	{ out: 'host-sync.js', ranges: [[469, 533]] },
	{ out: 'init.js', ranges: [[535, 625]] },
];
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');
function extractBody([from, to]) {
	return lines.slice(from - 1, to).join('\n');
}
function patchBody(body, file) {
	let b = body;
	if (file === 'helpers.js') {
		b = b.replace(
			/^\tfunction normalizeExecutorModelSetting/m,
			'\tfn.normalizeExecutorModelSetting = function',
		);
	}
	b = b.replace(/(?<!fn\.)normalizeExecutorModelSetting\(/g, 'fn.normalizeExecutorModelSetting(');
	return b;
}
for (const seg of segments) {
	const raw = seg.ranges.map((r) => extractBody(r)).join('\n');
	const body = patchBody(raw, seg.out);
	const outPath = path.join(outDir, seg.out);
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, header + fnOpen + body + '\n' + footer);
	console.log('wrote settings/role-models/' + seg.out, `(${body.split('\n').length} lines)`);
}
fs.unlinkSync(srcPath);
console.log('removed', srcPath);
