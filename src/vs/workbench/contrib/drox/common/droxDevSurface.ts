/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Surface produit : `dev` (watch / F5) ou `release` (`drox:ship`). */
export type DroxProductSurface = 'dev' | 'release';

export type DroxDevFeatureId =
	| 'chatVersionDevSuffix'
	| 'updateSimulateLatest'
	| 'updateSimulateInstallerUrl'
	| 'exportTranscript';

export interface IDroxSurfaceProductInfo {
	readonly droxSurface?: string;
}

/** Registre des capacités visibles uniquement en surface `dev`. */
export const DROX_DEV_FEATURES: Readonly<Record<DroxDevFeatureId, { readonly description: string }>> = {
	chatVersionDevSuffix: {
		description: 'Suffixe build dev dans le header chat (package.json / stamp moteur).',
	},
	updateSimulateLatest: {
		description: 'Réglage drox.update.simulateLatestVersion (preview notification MAJ).',
	},
	updateSimulateInstallerUrl: {
		description: 'Réglage drox.update.simulateInstallerUrl.',
	},
	exportTranscript: {
		description: 'Bouton export transcript dans le header Drox Chat.',
	},
};

export function getDroxSurface(product: IDroxSurfaceProductInfo): DroxProductSurface {
	return product.droxSurface === 'release' ? 'release' : 'dev';
}

export function isDroxDevFeatureEnabled(
	feature: DroxDevFeatureId,
	product: IDroxSurfaceProductInfo,
): boolean {
	void DROX_DEV_FEATURES[feature];
	return getDroxSurface(product) === 'dev';
}
