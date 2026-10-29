/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Trois tours sur le projet copié dans history-probe-lab.
 * La remise est fixée ici pour que le modèle ne cherche pas quoi inventer.
 */
export const HISTORY_PROBE_LAB_DIR = 'history-probe-lab';
export const HISTORY_PROBE_RESULTS_DIR = 'history-prob-lab-results';

export const HISTORY_PROBE_SCENARIO: readonly string[] = [
	'Salut. Analyse le projet avec les outils, sans te contenter du nom des fichiers. Utilise glob puis file_read sur main.py, atelier/pricing.py, atelier/receipts.py et docs/architecture.md. Résume ensuite ce que tu as lu.',
	'Je veux une remise de 10 % sur une ligne quand la quantité de cette pièce est d\'au moins 3, avant la TVA. Lis atelier/pricing.py avec file_read si besoin, puis dis-moi quel file_edit tu ferais. N\'écris pas encore le fichier.',
	'Applique maintenant. Appelle todo_write avec une seule étape : « Modifier atelier/pricing.py ». Passe-la in_progress, puis file_edit sur atelier/pricing.py pour la remise. Termine par la réponse à l\'utilisateur.',
];
