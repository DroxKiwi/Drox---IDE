/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxSurfaceProductInfo, isDroxDevFeatureEnabled } from './droxDevSurface.js';

/** Champs produit utiles pour le libellé chat (tous optionnels côté appelant). */
export type DroxProductVersionInfo = IDroxSurfaceProductInfo & {
	readonly droxVersion?: string;
	readonly version?: string;
	readonly droxEngineDevBuild?: number;
};

/** Identité du binaire moteur (handshake `initialize`). */
export type DroxEngineBuildIdentity = {
	readonly devBuild?: number;
	readonly gitSha?: string;
	readonly executablePath?: string;
};

/** Semver produit Drox (`droxVersion`, sinon base VS Code `version`). */
export function getDroxProductSemver(product: DroxProductVersionInfo): string {
	const v = (product.droxVersion?.trim() || product.version?.trim() || '').trim();
	return v.length > 0 ? v : '?';
}

/**
 * Fallback package.json (`droxEngineDevBuild`) — surface release uniquement.
 * En surface dev, le suffixe n’est affiché qu’après handshake moteur (évite un faux stamp).
 */
export function getDroxEngineDevBuildFromProduct(product: DroxProductVersionInfo): number | undefined {
	const n = product.droxEngineDevBuild;
	if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
		return undefined;
	}
	return Math.floor(n);
}

/** Epoch Unix (s) du build moteur → ISO UTC pour tooltip / logs. */
export function formatDroxDevBuildEpoch(epochSeconds: number): string {
	if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) {
		return '?';
	}
	try {
		return new Date(epochSeconds * 1000).toISOString();
	} catch {
		return String(Math.floor(epochSeconds));
	}
}

/** Build dev affiché : stamp moteur compilé uniquement (pas de fallback package.json en dev). */
export function resolveDroxEngineDevBuild(
	product: DroxProductVersionInfo,
	engineDevBuild?: number,
): number | undefined {
	if (typeof engineDevBuild === 'number' && Number.isFinite(engineDevBuild) && engineDevBuild > 0) {
		return Math.floor(engineDevBuild);
	}
	if (isDroxDevFeatureEnabled('chatVersionDevSuffix', product)) {
		return undefined;
	}
	return getDroxEngineDevBuildFromProduct(product);
}

/** Version complète affichée dans le header chat (produit + build dev optionnel). */
export function formatDroxChatVersionLabel(
	product: DroxProductVersionInfo,
	engineDevBuild?: number,
): string {
	const base = getDroxProductSemver(product);
	if (!isDroxDevFeatureEnabled('chatVersionDevSuffix', product)) {
		return base;
	}
	const build = resolveDroxEngineDevBuild(product, engineDevBuild);
	return build !== undefined && build > 0 ? `${base}.${build}` : base;
}

/** Titre tooltip header chat. */
export function formatDroxChatVersionTitle(
	product: DroxProductVersionInfo,
	identity?: DroxEngineBuildIdentity,
): string {
	const devBuild = identity?.devBuild;
	const label = formatDroxChatVersionLabel(product, devBuild);
	if (!isDroxDevFeatureEnabled('chatVersionDevSuffix', product)) {
		return `Drox ${label}`;
	}
	const build = resolveDroxEngineDevBuild(product, devBuild);
	const fromEngine = typeof devBuild === 'number' && devBuild > 0;
	if (build !== undefined && build > 0 && fromEngine) {
		const parts = [
			`Drox ${label}`,
			`git ${identity?.gitSha?.trim() || '?'}`,
			`compilé ${formatDroxDevBuildEpoch(build)}`,
		];
		const exe = identity?.executablePath?.trim();
		if (exe) {
			parts.push(exe);
		}
		return parts.join(' — ');
	}
	if (fromEngine) {
		return `Drox ${label} — moteur connecté (stamp incomplet)`;
	}
	return `Drox ${label} — en attente du moteur (stamp après initialize)`;
}
