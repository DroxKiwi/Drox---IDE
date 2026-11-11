/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import path from 'path';
import { promises as fs } from 'fs';
import { useEsbuildTranspile } from '../buildConfig.ts';

async function isEsmMainBundle(mainJsPath: string): Promise<boolean> {
	try {
		const head = (await fs.readFile(mainJsPath, 'utf8')).slice(0, 512);
		return head.includes('import ') && !head.includes('Object.defineProperty(exports');
	} catch {
		return false;
	}
}

export async function ensureClientCompiled(options: {
	rootDir: string;
	npm: string;
	runProcess: (command: string, args: readonly string[]) => Promise<void>;
}): Promise<void> {
	// The `out` folder may exist empty or partial after interrupted `npm run watch`.
	const required = [
		path.join(options.rootDir, 'out', 'main.js'),
		path.join(options.rootDir, 'out', 'vs', 'workbench', 'workbench.desktop.main.js'),
	];
	const missing: string[] = [];
	for (const file of required) {
		try {
			await fs.access(file);
		} catch {
			missing.push(path.relative(options.rootDir, file));
		}
	}

	const mainJs = path.join(options.rootDir, 'out', 'main.js');
	if (missing.length === 0 && useEsbuildTranspile && !(await isEsmMainBundle(mainJs))) {
		console.warn('[preLaunch] out/main.js is CommonJS (stale gulp output). Re-transpiling with esbuild...');
		missing.push('out/main.js (stale CJS)');
	}

	if (missing.length === 0) {
		return;
	}
	// `compile` is strict and may fail for non-runtime typing errors.
	// Here we only need client artifacts for local launch.
	const transpileCmd = useEsbuildTranspile
		? ['run', 'transpile-client']
		: ['run', 'gulp', '--', 'transpile-client'];
	console.log(`[preLaunch] Missing ${missing.join(', ')} — running client transpile (npm ${transpileCmd.join(' ')})...`);
	await options.runProcess(options.npm, transpileCmd);
}
