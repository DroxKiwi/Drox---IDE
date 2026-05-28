/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pathToFileURL } from 'url';
import { access } from 'fs/promises';
import { readFileSync } from 'fs';

const entry = pathToFileURL(new URL('../out/vs/workbench/workbench.desktop.main.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')).href;
const visited = new Set();
const missing = [];

async function check(url) {
	if (visited.has(url)) {
		return;
	}
	visited.add(url);
	let filePath;
	try {
		filePath = new URL(url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
	} catch {
		return;
	}
	try {
		await access(filePath);
	} catch {
		missing.push(filePath);
		return;
	}
	let text;
	try {
		text = readFileSync(filePath, 'utf8');
	} catch {
		return;
	}
	const re = /from\s+["']([^"']+)["']/g;
	let m;
	while ((m = re.exec(text))) {
		const spec = m[1];
		if (!spec.endsWith('.js')) {
			continue;
		}
		await check(new URL(spec, url).href);
	}
}

await check(entry);
console.log('visited', visited.size);
console.log('missing count', missing.length);
for (const p of missing.slice(0, 30)) {
	console.log('MISSING', p);
}
process.exit(missing.length ? 1 : 0);
