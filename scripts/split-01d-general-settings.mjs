/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

// Split core/01d-general-settings.js into core/general-settings/* modules.
// Usage: node scripts/split-01d-general-settings.mjs

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/settings/01d-general-settings.js',
);
const outDir = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/settings/general-settings',
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
	{ out: 'state.js', ranges: [[11, 12]] },
	{ out: 'chat-issues.js', ranges: [[14, 50]] },
	{ out: 'helpers.js', ranges: [[52, 88]] },
	{ out: 'panel.js', ranges: [[90, 228]] },
	{ out: 'host-sync.js', ranges: [[230, 243]] },
	{ out: 'init.js', ranges: [[245, 302]] },
];
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');
function extractBody([from, to]) {
	return lines.slice(from - 1, to).join('\n');
}
function patchBody(body, file) {
	let b = body;
	if (file === 'helpers.js') {
		b = b.replace(/^\tfunction readOptionalNumber/m, '\tfn.readOptionalNumber = function');
		b = b.replace(/^\tfunction syncEngineTuningPanelVisibility/m, '\tfn.syncEngineTuningPanelVisibility = function');
		b = b.replace(/^\tfunction syncGeneralSettingsVignetteHint/m, '\tfn.syncGeneralSettingsVignetteHint = function');
	} else if (file === 'panel.js' || file === 'host-sync.js' || file === 'init.js') {
		b = b.replace(/readOptionalNumber\(/g, 'fn.readOptionalNumber(');
		b = b.replace(/syncEngineTuningPanelVisibility\(/g, 'fn.syncEngineTuningPanelVisibility(');
		b = b.replace(/syncGeneralSettingsVignetteHint\(/g, 'fn.syncGeneralSettingsVignetteHint(');
	}
	return b;
}
for (const seg of segments) {
	const raw = seg.ranges.map((r) => extractBody(r)).join('\n');
	const body = patchBody(raw, seg.out);
	const outPath = path.join(outDir, seg.out);
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, header + fnOpen + body + '\n' + footer);
	console.log('wrote settings/general-settings/' + seg.out, `(${body.split('\n').length} lines)`);
}
fs.unlinkSync(srcPath);
console.log('removed', srcPath);
