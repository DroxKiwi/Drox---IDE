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

/** Semver produit Drox (`droxVersion`, sinon base VS Code `version`). */
export function getDroxProductSemver(product: DroxProductVersionInfo): string {
	const v = (product.droxVersion?.trim() || product.version?.trim() || '').trim();
	return v.length > 0 ? v : '?';
}

/**
 * Fallback package.json (`droxEngineDevBuild`) — utilisé avant handshake moteur.
 */
export function getDroxEngineDevBuildFromProduct(product: DroxProductVersionInfo): number | undefined {
	const n = product.droxEngineDevBuild;
	if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
		return undefined;
	}
	return Math.floor(n);
}

/** Build dev affiché : moteur compilé en priorité, sinon fallback produit. */
export function resolveDroxEngineDevBuild(
	product: DroxProductVersionInfo,
	engineDevBuild?: number,
): number | undefined {
	if (typeof engineDevBuild === 'number' && Number.isFinite(engineDevBuild) && engineDevBuild > 0) {
		return Math.floor(engineDevBuild);
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
	engineDevBuild?: number,
): string {
	const label = formatDroxChatVersionLabel(product, engineDevBuild);
	if (!isDroxDevFeatureEnabled('chatVersionDevSuffix', product)) {
		return `Drox ${label}`;
	}
	const build = resolveDroxEngineDevBuild(product, engineDevBuild);
	const fromEngine = typeof engineDevBuild === 'number' && engineDevBuild > 0;
	if (build !== undefined && build > 0) {
		if (fromEngine) {
			return `Drox ${label} — build moteur compilé (drox.exe, stamp Rust #${build})`;
		}
		return `Drox ${label} — build moteur dev #${build} (fallback package.json, en attente du moteur)`;
	}
	return `Drox ${label}`;
}
