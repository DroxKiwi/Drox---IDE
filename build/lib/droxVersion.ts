/*---------------------------------------------------------------------------------------------
 *  Copyright (c) KDDS. Drox IDE fork — version helpers for build/release scripts.
 *--------------------------------------------------------------------------------------------*/

import pkg from '../../package.json' with { type: 'json' };

export type DroxProductSurface = 'dev' | 'release';

type PackageJsonWithDrox = typeof pkg & {
	droxVersion?: string;
	droxSurface?: DroxProductSurface;
	droxEngineDevBuild?: number;
};

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

/** Surface produit pour le package Electron (`DROX_PRODUCT_SURFACE` prioritaire au ship). */
export function resolveDroxProductSurfaceForPackaging(): DroxProductSurface {
	const env = process.env.DROX_PRODUCT_SURFACE?.trim();
	if (env === 'release' || env === 'dev') {
		return env;
	}
	const fromPkg = (pkg as PackageJsonWithDrox).droxSurface;
	if (fromPkg === 'release' || fromPkg === 'dev') {
		return fromPkg;
	}
	return 'dev';
}

/** Dev engine iteration counter (`package.json` → `droxEngineDevBuild`). */
export function getPackageDroxEngineDevBuild(): number | undefined {
	const n = (pkg as PackageJsonWithDrox).droxEngineDevBuild;
	if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
		return undefined;
	}
	return Math.floor(n);
}
