/*---------------------------------------------------------------------------------------------
 *  Drox IDE - resolve Inno Setup compiler (ISCC), prefer 6.6+ for native dark wizard.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const MIN_VERSION = [6, 6, 0] as const;

export type InnoSetupCompiler = {
	iscc: string;
	version: string;
	source: 'env' | 'vendored' | 'program-files' | 'npm-legacy';
};

function parseVersion(version: string): number[] {
	const parts = version.split(/[.,]/).map(p => parseInt(p, 10)).filter(n => !Number.isNaN(n));
	while (parts.length < 3) {
		parts.push(0);
	}
	return parts;
}

function versionAtLeast(version: string, min: readonly [number, number, number]): boolean {
	const parts = parseVersion(version);
	for (let i = 0; i < 3; i++) {
		if (parts[i] > min[i]) {
			return true;
		}
		if (parts[i] < min[i]) {
			return false;
		}
	}
	return true;
}

function readPeFileVersion(iscc: string): string | undefined {
	if (process.platform !== 'win32') {
		return undefined;
	}
	const escaped = iscc.replace(/'/g, "''");
	const ps = spawnSync(
		'powershell.exe',
		['-NoProfile', '-Command', `(Get-Item -LiteralPath '${escaped}').VersionInfo.ProductVersion`],
		{ encoding: 'utf8' },
	);
	if (ps.status !== 0) {
		return undefined;
	}
	const v = (ps.stdout || '').trim();
	return v && v !== '0.0.0.0' ? v : undefined;
}

function readIsccCopyrightYear(iscc: string): number | undefined {
	if (process.platform !== 'win32') {
		return undefined;
	}
	const result = spawnSync(iscc, [], { encoding: 'utf8' });
	const text = `${result.stdout || ''}${result.stderr || ''}`;
	const match = text.match(/Copyright \(C\) 1997-(\d{4})/);
	if (!match) {
		return undefined;
	}
	return parseInt(match[1], 10);
}

function isLegacyNpmInno(iscc: string): boolean {
	return iscc.replace(/\\/g, '/').includes('/node_modules/innosetup/');
}

function meetsMinimum(iscc: string, peVersion: string | undefined): boolean {
	if (isLegacyNpmInno(iscc)) {
		return false;
	}
	if (peVersion && versionAtLeast(peVersion, MIN_VERSION)) {
		return true;
	}
	const year = readIsccCopyrightYear(iscc);
	// npm 6.4.x banner ends with 2025; Inno 6.6+ (winget / officiel) ends with 2026+.
	return year !== undefined && year >= 2026;
}

function displayVersion(iscc: string, peVersion: string | undefined): string {
	if (peVersion && versionAtLeast(peVersion, MIN_VERSION)) {
		return peVersion;
	}
	const year = readIsccCopyrightYear(iscc);
	return year ? `6.6+ (banner ${year})` : '6.6+';
}

function npmInnoPath(): string {
	return path.join(path.dirname(path.dirname(require.resolve('innosetup'))), 'bin', 'ISCC.exe');
}

export function resolveInnoSetupCompiler(repoPath: string): InnoSetupCompiler {
	const candidates: { iscc: string; source: InnoSetupCompiler['source'] }[] = [];

	if (process.env.INNO_SETUP_ISCC) {
		candidates.push({ iscc: process.env.INNO_SETUP_ISCC, source: 'env' });
	}

	candidates.push({
		iscc: path.join(repoPath, 'build', 'win32', 'inno-setup-6', 'ISCC.exe'),
		source: 'vendored',
	});

	const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
	const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
	const localPrograms = process.env.LOCALAPPDATA
		? path.join(process.env.LOCALAPPDATA, 'Programs', 'Inno Setup 6', 'ISCC.exe')
		: '';
	if (localPrograms) {
		candidates.push({ iscc: localPrograms, source: 'program-files' });
	}
	for (const root of [programFilesX86, programFiles]) {
		candidates.push({
			iscc: path.join(root, 'Inno Setup 6', 'ISCC.exe'),
			source: 'program-files',
		});
	}

	const legacy = npmInnoPath();
	let legacyEntry: InnoSetupCompiler | undefined;

	for (const { iscc, source } of candidates) {
		if (!fs.existsSync(iscc)) {
			continue;
		}
		const peVersion = readPeFileVersion(iscc);
		if (!meetsMinimum(iscc, peVersion)) {
			console.warn(`[inno] Ignoring ${iscc} (Inno Setup < 6.6)`);
			continue;
		}
		return { iscc, version: displayVersion(iscc, peVersion), source };
	}

	if (fs.existsSync(legacy)) {
		legacyEntry = {
			iscc: legacy,
			version: readPeFileVersion(legacy) || '6.4.0',
			source: 'npm-legacy',
		};
	}

	throw new Error(
		[
			'Inno Setup 6.6+ (ISCC) introuvable.',
			'Le paquet npm "innosetup" est bloque en 6.4.1 (pas de dark mode natif).',
			'Installez le compilateur puis relancez le build :',
			'  .\\scripts\\ensure-inno-setup.ps1',
			'  winget install --id JRSoftware.InnoSetup -e',
			legacyEntry
				? `(detecte npm ${legacyEntry.version} - insuffisant pour le theme Drox)`
				: '',
		]
			.filter(Boolean)
			.join('\n'),
	);
}
