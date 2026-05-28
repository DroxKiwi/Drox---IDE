/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const MS_HEADER = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

`;
const UNICODE_FILE = '// allow-any-unicode-comment-file\n\n';
const KDDS_LINE = /^\/\* Copyright \(c\) 2026 KDDS[^\n]*\*\/\s*\n|^\/\/ Copyright \(c\) 2026 KDDS[^\n]*\n\n?/m;

const roots = [
	path.join(root, 'src/vs/workbench/contrib/drox'),
	path.join(root, 'src/vs/workbench/contrib/welcomeGettingStarted/browser/media/gettingStarted.css'),
];

const exts = new Set(['.ts', '.js', '.css']);

function walk(dir, out = []) {
	if (!fs.existsSync(dir)) {
		return out;
	}
	for (const name of fs.readdirSync(dir)) {
		const p = path.join(dir, name);
		const st = fs.statSync(p);
		if (st.isDirectory()) {
			walk(p, out);
		} else if (exts.has(path.extname(name)) && !name.endsWith('.bak')) {
			out.push(p);
		}
	}
	return out;
}

function fixFile(filePath) {
	let s = fs.readFileSync(filePath, 'utf8');
	s = s.replace(KDDS_LINE, '');
	s = s.replace(/^\/\*[\s\S]*?\*\/\s*/m, '');
	s = s.replace(/^\/\/ allow-any-unicode-comment-file\s*\n*/m, '');
	s = s.replace(/^\s*\/\s*\n/gm, '');
	s = s.replace(/^\n+/, '');
	const needsUnicode = /[^\t\n\r\x20-\x7E]/.test(s);
	s = MS_HEADER + (needsUnicode ? UNICODE_FILE : '') + s;
	fs.writeFileSync(filePath, s);
}

const files = roots.flatMap(r => (fs.statSync(r).isFile() ? [r] : walk(r)));
for (const f of files) {
	fixFile(f);
}
console.log(`fixed ${files.length} files`);
