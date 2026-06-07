/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

// Split stream/07-log.js into stream/log/* modules.
// Usage: node scripts/split-07-log.mjs

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(
	root,
	'src/vs/workbench/contrib/drox/browser/media/droxChat/stream/07-log.js',
);
const streamDir = path.join(root, 'src/vs/workbench/contrib/drox/browser/media/droxChat/stream');
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
/** 1-based inclusive line ranges (body only, inside original IIFE). */
const segments = [
	{
		out: 'log/00-constants.js',
		prefix: `\tconst c = D.streamLog = D.streamLog || {};
`,
		ranges: [[10, 15], [766, 771]],
	},
	{ out: 'discussion/state.js', ranges: [[17, 96]] },
	{ out: 'discussion/text.js', ranges: [[98, 508]] },
	{ out: 'discussion/ui.js', ranges: [[510, 765]] },
	{
		out: 'answer/helpers.js',
		prefix: `\tconst { EXPLORE_PHASES, FINAL_ANSWER_MIN_CHARS, EXPLORE_INTERNAL_PROSE_PHASES } = D.streamLog;
`,
		ranges: [[773, 815], [816, 829]],
	},
	{
		out: 'answer/presentation.js',
		prefix: `\tconst { EXPLORE_PHASES } = D.streamLog;
`,
		ranges: [[830, 928]],
	},
	{ out: 'messages/viewer.js', ranges: [[929, 1026]] },
	{ out: 'messages/scroll.js', ranges: [[1027, 1073]] },
	{ out: 'messages/user.js', ranges: [[1083, 1175]] },
	{ out: 'messages/orchestration.js', ranges: [[1176, 1236]] },
	{ out: 'executor/capture.js', ranges: [[1238, 1682]] },
	{ out: 'executor/subagents.js', ranges: [[1683, 1869]] },
	{ out: 'dev/gateTags.js', ranges: [[1871, 2037]] },
	{
		out: 'explore/bundle.js',
		prefix: `\tconst { EXPLORE_PHASES } = D.streamLog;
`,
		ranges: [[2080, 2357]],
	},
	{
		out: 'explore/phases.js',
		prefix: `\tconst { INDENTED_PHASES, EXPLORE_PHASES } = D.streamLog;
`,
		ranges: [[2358, 2484]],
	},
	{
		out: 'explore/promote.js',
		prefix: `\tconst {
\t\tEXPLORE_PHASES,
\t\tEXPLORE_INTERNAL_PROSE_PHASES,
\t\tFINAL_ANSWER_MIN_CHARS,
\t} = D.streamLog;
`,
		ranges: [[2485, 2706]],
	},
	{
		out: 'answer/stream.js',
		prefix: `\tconst { EXPLORE_PHASES } = D.streamLog;
`,
		ranges: [[2708, 2955]],
	},
	{
		out: 'answer/deltas.js',
		prefix: `\tconst { EXPLORE_PHASES, EXPLORE_REASONING_PHASES } = D.streamLog;
`,
		ranges: [[2957, 3150]],
	},
	{
		out: 'tools/logTools.js',
		prefix: `\tconst { EXPLORE_READ_VERBS, EXPLORE_SEARCH_VERBS } = D.streamLog;
`,
		ranges: [[3152, 3346]],
	},
];
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');
function extractBody([from, to]) {
	return lines.slice(from - 1, to).join('\n');
}
function rewriteConstantsBlock(body) {
	return body
		.replace(/\bconst INDENTED_PHASES\b/g, 'c.INDENTED_PHASES')
		.replace(/\bconst EXPLORE_PHASES\b/g, 'c.EXPLORE_PHASES')
		.replace(/\bconst EXPLORE_REASONING_PHASES\b/g, 'c.EXPLORE_REASONING_PHASES')
		.replace(/\bconst DISCUSSION_DONE_MARKER\b/g, 'c.DISCUSSION_DONE_MARKER')
		.replace(/\bconst EXPLORE_INTERNAL_PROSE_PHASES\b/g, 'c.EXPLORE_INTERNAL_PROSE_PHASES')
		.replace(/\bconst EXPLORE_READ_VERBS\b/g, 'c.EXPLORE_READ_VERBS')
		.replace(/\bconst EXPLORE_SEARCH_VERBS\b/g, 'c.EXPLORE_SEARCH_VERBS')
		.replace(/\bconst FINAL_ANSWER_MIN_CHARS\b/g, 'c.FINAL_ANSWER_MIN_CHARS');
}
for (const seg of segments) {
	const parts = seg.ranges.map((r) => extractBody(r));
	let body = parts.join('\n');
	if (seg.out === 'log/00-constants.js') {
		body = rewriteConstantsBlock(body);
	}
	const outPath = path.join(streamDir, seg.out);
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	const content = header + fnOpen + (seg.prefix || '') + body + '\n' + footer;
	fs.writeFileSync(outPath, content);
	console.log('wrote', seg.out, `(${body.split('\n').length} lines)`);
}
fs.unlinkSync(srcPath);
console.log('removed', srcPath);
