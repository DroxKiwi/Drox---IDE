/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import path from 'path';
import * as util from './util.ts';

/** One line under `.build`: the runtime folder name (`electron` or `electron-runtime-<time>`). */
const electronActiveSubdirFileName = 'electron-active-subdir';
const subdirNamePattern = /^[a-zA-Z0-9._-]+$/;

function electronActiveSubdirPath(root: string): string {
	return path.join(root, '.build', electronActiveSubdirFileName);
}

export async function readElectronActiveSubdir(root: string): Promise<string> {
	try {
		const raw = (await fs.readFile(electronActiveSubdirPath(root), 'utf8')).trim().split(/\r?\n/)[0] ?? '';
		if (raw && subdirNamePattern.test(raw)) {
			return raw;
		}
	} catch {
		/* fichier absent */
	}
	return 'electron';
}

async function writeElectronActiveSubdir(root: string, subdirUnderBuild: string): Promise<void> {
	if (!subdirNamePattern.test(subdirUnderBuild)) {
		throw new Error(`[electron] Nom de dossier runtime invalide: ${subdirUnderBuild}`);
	}
	await fs.mkdir(path.join(root, '.build'), { recursive: true });
	await fs.writeFile(electronActiveSubdirPath(root), `${subdirUnderBuild}\n`, 'utf8');
}

async function clearElectronActiveSubdir(root: string): Promise<void> {
	await fs.unlink(electronActiveSubdirPath(root)).catch(() => { /* absent */ });
}

async function rimrafElectronWithBusyRetry(electronPath: string, productNameShort: string): Promise<void> {
	const maxAttempts = 6;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			await util.rimraf(electronPath)();
			return;
		} catch (err: unknown) {
			const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
			if (code === 'EBUSY' && attempt < maxAttempts) {
				const msg = `[electron] .build/electron is locked (EBUSY), attempt ${attempt}/${maxAttempts - 1}. Close all "${productNameShort}" windows and retry.`;
				console.warn(msg);
				await new Promise(r => setTimeout(r, 2000));
				continue;
			}
			if (code === 'EBUSY') {
				console.error(
					`[electron] Cannot remove ${electronPath}: file in use. Close "${productNameShort}" (and any tool using .build/electron), then retry.`,
				);
			}
			throw err;
		}
	}
}

/**
 * On Windows, deleting files under .build/electron often fails with EBUSY
 * (Defender, indexer). Extract to staging then replace via rename.
 * If the old folder cannot be renamed or removed, install the runtime under
 * .build/electron-runtime-<timestamp> and record that name for code.bat / preLaunch.
 */
async function mainWindowsElectronSwap(root: string, downloadTo: (destRel: string) => Promise<void>): Promise<void> {
	const electronAbs = path.join(root, '.build', 'electron');
	const stagingRel = '.build/electron-staging';
	const stagingAbs = path.join(root, stagingRel);

	await util.rimraf(stagingAbs)().catch(() => { /* staging absent ou jetable */ });

	await downloadTo(stagingRel);

	const hadPrevious = await fs
		.access(electronAbs)
		.then(() => true)
		.catch(() => false);

	if (hadPrevious) {
		const trashRel = `.build/electron-trash-${Date.now()}`;
		const trashAbs = path.join(root, trashRel);
		try {
			await fs.rename(electronAbs, trashAbs);
			console.log(`[electron] Previous runtime moved to ${trashRel} (Windows EBUSY workaround).`);
			setImmediate(() => {
				void util.rimraf(trashAbs)().catch(() => {
					console.warn(`[electron] Remove obsolete folder manually: ${trashRel}`);
				});
			});
		} catch {
			console.warn(
				'[electron] Cannot rename or remove .build/electron (often Defender / indexer). ' +
				'Installing runtime in a parallel folder...',
			);
			const fallbackSubdir = `electron-runtime-${Date.now()}`;
			const fallbackAbs = path.join(root, '.build', fallbackSubdir);
			await util.rimraf(fallbackAbs)().catch(() => { /* nouveau nom unique */ });
			await fs.rename(stagingAbs, fallbackAbs);
			await writeElectronActiveSubdir(root, fallbackSubdir);
			console.warn(
				`[electron] Use .build/${fallbackSubdir} now (see .build/electron-active-subdir). ` +
				'You can delete .build/electron later or add an antivirus exclusion for .build.',
			);
			return;
		}
	}

	await fs.rename(stagingAbs, electronAbs);
	await clearElectronActiveSubdir(root);
}

export async function installElectronRuntime(options: {
	root: string;
	productNameShort: string;
	downloadTo: (destRel: string) => Promise<void>;
}): Promise<void> {
	if (process.platform === 'win32') {
		await mainWindowsElectronSwap(options.root, options.downloadTo);
		return;
	}
	const electronPath = path.join(options.root, '.build', 'electron');
	await rimrafElectronWithBusyRetry(electronPath, options.productNameShort);
	await options.downloadTo('.build/electron');
}

export async function ensureElectronBuilt(options: {
	rootDir: string;
	runElectron: () => Promise<void>;
}): Promise<void> {
	const exists = async (rel: string) => {
		try {
			await fs.stat(path.join(options.rootDir, rel));
			return true;
		} catch {
			return false;
		}
	};

	// On Windows, an interrupted build (e.g. EBUSY) may leave default_app.asar without the exe
	// (e.g. "Drox IDE.exe"). Do not reuse in that case.
	const relAsar = path.join('.build', 'electron', 'resources', 'default_app.asar');
	const hasAsar = await exists(relAsar);

	if (process.platform === 'win32') {
		let nameShort: string;
		try {
			const product = JSON.parse(await fs.readFile(path.join(options.rootDir, 'product.json'), 'utf8')) as { nameShort?: string };
			nameShort = product.nameShort ?? 'Code';
		} catch {
			await options.runElectron();
			return;
		}
		const sub = await readElectronActiveSubdir(options.rootDir);
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
		await options.runElectron();
		return;
	}

	if (hasAsar) {
		console.log('[preLaunch] .build/electron found — reusing existing Electron runtime.');
		return;
	}

	await options.runElectron();
}
