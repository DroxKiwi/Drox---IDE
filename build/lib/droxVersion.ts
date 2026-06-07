/*---------------------------------------------------------------------------------------------
 *  Copyright (c) KDDS. Drox IDE fork — version helpers for build/release scripts.
 *--------------------------------------------------------------------------------------------*/

import pkg from '../../package.json' with { type: 'json' };

type PackageJsonWithDrox = typeof pkg & { droxVersion?: string; droxEngineDevBuild?: number };

/** Drox product semver from root package.json (`droxVersion`). */
export function getPackageDroxVersion(): string | undefined {
	return (pkg as PackageJsonWithDrox).droxVersion;
}

/** VS Code / extension API base from root package.json (`version`). */
export function getPackageVscodeBaseVersion(): string {
	return pkg.version.replace(/-\w+$/, '');
}

/** Version string for Inno setup filenames and release manifests. */
export function getDroxSetupVersion(): string {
	return getPackageDroxVersion() ?? getPackageVscodeBaseVersion();
}

/** Dev engine iteration counter (`package.json` → `droxEngineDevBuild`). */
export function getPackageDroxEngineDevBuild(): number | undefined {
	const n = (pkg as PackageJsonWithDrox).droxEngineDevBuild;
	if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
		return undefined;
	}
	return Math.floor(n);
}
