/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'path';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { useEsbuildTranspile } from '../buildConfig.ts';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const rootDir = path.resolve(import.meta.dirname, '..', '..');

/** Same convention as build/lib/electron.ts */
const electronActiveSubdirFile = () => path.join(rootDir, '.build', 'electron-active-subdir');

async function win32ElectronSubdir(): Promise<string> {
	try {
		const raw = (await fs.readFile(electronActiveSubdirFile(), 'utf8')).trim().split(/\r?\n/)[0] ?? '';
		if (raw && /^[a-zA-Z0-9._-]+$/.test(raw)) {
			return raw;
		}
	} catch {
		/* fichier absent */
	}
	return 'electron';
}

function runProcess(command: string, args: ReadonlyArray<string> = []) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, { cwd: rootDir, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
		child.on('exit', err => !err ? resolve() : process.exit(err ?? 1));
		child.on('error', reject);
	});
}

async function exists(subdir: string) {
	try {
		await fs.stat(path.join(rootDir, subdir));
		return true;
	} catch {
		return false;
	}
}

async function ensureNodeModules() {
	if (!(await exists('node_modules'))) {
		await runProcess(npm, ['ci']);
	}
}

async function getElectron() {
	await runProcess(npm, ['run', 'electron']);
}

async function ensureElectronBuilt() {
	// On Windows, an interrupted build (e.g. EBUSY) may leave default_app.asar without the exe
	// (e.g. "Drox IDE.exe"). Do not reuse in that case.
	const relAsar = path.join('.build', 'electron', 'resources', 'default_app.asar');
	const hasAsar = await exists(relAsar);

	if (process.platform === 'win32') {
		let nameShort: string;
		try {
			const product = JSON.parse(await fs.readFile(path.join(rootDir, 'product.json'), 'utf8')) as { nameShort?: string };
			nameShort = product.nameShort ?? 'Code';
		} catch {
			await getElectron();
			return;
		}
		const sub = await win32ElectronSubdir();
		const relAsarWin = path.join('.build', sub, 'resources', 'default_app.asar');
		const relExeWin = path.join('.build', sub, `${nameShort}.exe`);
		const hasAsarWin = await exists(relAsarWin);
		const hasExeWin = await exists(relExeWin);
		if (hasAsarWin && hasExeWin) {
			if (sub !== 'electron') {
				console.log(`[preLaunch] Electron runtime OK (.build/${sub}, EBUSY workaround).`);
			} else {
				console.log('[preLaunch] .build/electron complete — reusing existing Electron runtime.');
			}
			return;
		}
		if (hasAsarWin && !hasExeWin) {
			console.warn(`[preLaunch] .build/${sub} incomplete (missing ${nameShort}.exe). Re-extracting Electron...`);
		}
		await getElectron();
		return;
	}

	if (hasAsar) {
		console.log('[preLaunch] .build/electron found — reusing existing Electron runtime.');
		return;
	}

	await getElectron();
}

async function isEsmMainBundle(mainJsPath: string): Promise<boolean> {
	try {
		const head = (await fs.readFile(mainJsPath, 'utf8')).slice(0, 512);
		return head.includes('import ') && !head.includes('Object.defineProperty(exports');
	} catch {
		return false;
	}
}

async function ensureCompiled() {
	// The `out` folder may exist empty or partial after interrupted `npm run watch`.
	const required = [
		path.join(rootDir, 'out', 'main.js'),
		path.join(rootDir, 'out', 'vs', 'workbench', 'workbench.desktop.main.js'),
	];
	const missing: string[] = [];
	for (const file of required) {
		try {
			await fs.access(file);
		} catch {
			missing.push(path.relative(rootDir, file));
		}
	}

	const mainJs = path.join(rootDir, 'out', 'main.js');
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
	await runProcess(npm, transpileCmd);
}

async function main() {
	await ensureNodeModules();
	await ensureElectronBuilt();
	await ensureCompiled();

	// Can't require this until after dependencies are installed
	const { getBuiltInExtensions } = await import('./builtInExtensions.ts');
	await getBuiltInExtensions();
}

if (import.meta.main) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
