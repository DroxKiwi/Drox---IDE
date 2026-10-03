#!/usr/bin/env node
/**
 * Merge platform entries into Drox---IDE---OR stable/latest.json.
 * Used by release-publish-win32.ps1 and release-publish-linux.sh.
 *
 * Usage:
 *   node scripts/lib/drox-release-manifest.mjs read --releases-repo ../Drox---IDE---OR
 *   node scripts/lib/drox-release-manifest.mjs merge --releases-repo ../Drox---IDE---OR \
 *     --version 1.5.1 --platform linux-x64 --installer-url URL --sha256 HASH --size-bytes N
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function readPackageDroxVersion() {
	const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
	return String(pkg.droxVersion || pkg.version || '1.5.1');
}

function defaultReleasesRepo() {
	return repoRoot;
}

function latestJsonPath(releasesRepo) {
	return path.join(releasesRepo, 'stable', 'latest.json');
}

function readManifest(releasesRepo) {
	const p = latestJsonPath(releasesRepo);
	if (!fs.existsSync(p)) {
		return null;
	}
	try {
		return JSON.parse(fs.readFileSync(p, 'utf8'));
	} catch {
		return null;
	}
}

function writeUtf8NoBom(filePath, content) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, { encoding: 'utf8' });
}

function buildManifest(opts) {
	const releasesRepo = opts.releasesRepo || defaultReleasesRepo();
	const version = opts.version || readPackageDroxVersion();
	const platform = opts.platform;
	if (!platform) {
		throw new Error('--platform is required');
	}
	const installerUrl = opts.installerUrl;
	if (!installerUrl) {
		throw new Error('--installer-url is required');
	}

	const existing = readManifest(releasesRepo) || {};
	const platforms = { ...(existing.platforms || {}) };
	platforms[platform] = {
		installerUrl,
		sha256: String(opts.sha256 || '').toLowerCase(),
		sizeBytes: Number(opts.sizeBytes || 0),
	};

	const defaultNotes = `https://github.com/DroxKiwi/Drox---IDE/blob/main/stable/${version}/RELEASE_NOTES.md`;
	// Prefer explicit notes, else notes for the new version (don't keep previous version's URL).
	let notesUrl = opts.notesUrl || defaultNotes;
	notesUrl = String(notesUrl).replace(/Drox---IDE---OR/g, 'Drox---IDE');

	return {
		manifest: {
			version,
			released: opts.released || existing.released || new Date().toISOString().slice(0, 10),
			productVersion: version,
			platforms,
			mandatory: existing.mandatory ?? false,
			notesUrl,
		},
		path: latestJsonPath(releasesRepo),
	};
}

function mergePlatform(opts) {
	const { manifest, path: out } = buildManifest(opts);
	writeUtf8NoBom(out, JSON.stringify(manifest, null, 2) + '\n');
	return { manifest, path: out };
}

function parseArgs(argv) {
	const args = { _: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--releases-repo') {
			args.releasesRepo = argv[++i];
		} else if (a === '--version') {
			args.version = argv[++i];
		} else if (a === '--platform') {
			args.platform = argv[++i];
		} else if (a === '--installer-url') {
			args.installerUrl = argv[++i];
		} else if (a === '--sha256') {
			args.sha256 = argv[++i];
		} else if (a === '--size-bytes') {
			args.sizeBytes = argv[++i];
		} else if (a === '--released') {
			args.released = argv[++i];
		} else if (a === '--notes-url') {
			args.notesUrl = argv[++i];
		} else if (a === '--dry-run') {
			args.dryRun = true;
		} else if (!a.startsWith('-')) {
			args._.push(a);
		}
	}
	return args;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

if (cmd === 'read') {
	const m = readManifest(args.releasesRepo || defaultReleasesRepo());
	console.log(JSON.stringify(m, null, 2));
	process.exit(0);
}

if (cmd === 'version') {
	console.log(readPackageDroxVersion());
	process.exit(0);
}

if (cmd === 'merge') {
	if (args.dryRun) {
		const preview = buildManifest({ ...args, releasesRepo: args.releasesRepo || defaultReleasesRepo() });
		console.log(JSON.stringify(preview.manifest, null, 2));
		process.exit(0);
	}
	const result = mergePlatform(args);
	console.log(`[drox-manifest] updated ${result.path}`);
	console.log(`[drox-manifest] platform ${args.platform} -> ${args.installerUrl}`);
	process.exit(0);
}

console.error(`Usage: node drox-release-manifest.mjs <read|version|merge> [options]`);
process.exit(1);
