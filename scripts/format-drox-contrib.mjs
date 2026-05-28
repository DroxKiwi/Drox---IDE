/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { format } from '../build/lib/formatter.ts';

const root = path.join(import.meta.dirname, '..', 'src/vs/workbench/contrib/drox');

function collectTsFiles(dir, out = []) {
	for (const name of fs.readdirSync(dir)) {
		const p = path.join(dir, name);
		if (fs.statSync(p).isDirectory()) {
			collectTsFiles(p, out);
		} else if (p.endsWith('.ts')) {
			out.push(p);
		}
	}
	return out;
}

let n = 0;
for (const file of collectTsFiles(root)) {
	const raw = fs.readFileSync(file, 'utf8');
	const formatted = format(file, raw);
	if (raw.replace(/\r\n/gm, '\n') !== formatted.replace(/\r\n/gm, '\n')) {
		fs.writeFileSync(file, formatted);
		n++;
	}
}
console.log(`formatted ${n} files`);
