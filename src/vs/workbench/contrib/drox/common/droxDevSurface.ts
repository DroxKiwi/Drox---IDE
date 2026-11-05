/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file

import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';

/** Surface produit : `dev` (watch / F5) ou `release` (`drox:ship`). */
export type DroxProductSurface = 'dev' | 'release';

/** Vrai une fois le workbench lié, uniquement si `droxSurface` n'est pas `release`. */
export const DroxDevSurfaceContext = new RawContextKey<boolean>('droxDevSurface', false);

export type DroxDevFeatureId =

	| 'chatVersionDevSuffix'

	| 'updateSimulateLatest'

	| 'updateSimulateInstallerUrl'

	| 'exportTranscript'

	| 'runCapture'

	| 'executablePath'

	| 'historyProbe'

	| 'sdtcmExport'

	| 'sdtcmConsistency';
export interface IDroxSurfaceProductInfo {

	readonly droxSurface?: string;

}
/** Registre des capacités visibles uniquement en surface `dev`. */

export const DROX_DEV_FEATURES: Readonly<Record<DroxDevFeatureId, { readonly description: string }>> = {

	chatVersionDevSuffix: {

		description: 'Suffixe build moteur (epoch Unix + git) dans le header chat après handshake.',

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

	runCapture: {

		description: 'Bouton bug à côté de l\'export : enregistre le payload LLM seulement quand il est rouge.',

	},

	executablePath: {

		description: 'Réglage drox.executablePath (Settings IDE — dogfood binaire local, hors vignette chat).',

	},

	historyProbe: {

		description: 'Commande palette « History probe » : session dédiée, snapshot de l\'historique réellement envoyé au modèle.',

	},

	sdtcmExport: {

		description: 'Bouton export de la discussion SDTCM, consigne système et injections comprises.',

	},

	sdtcmConsistency: {

		description: 'Bloc Consistency du panneau SDTCM (phases, tours, Run consistency).',

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

