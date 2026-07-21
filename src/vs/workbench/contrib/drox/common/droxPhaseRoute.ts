/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Routage phases moteur → thinking vs réponse visible (AMB-09).
 *
 * Source de vérité pour Agents + ui-replay. La webview (JS) doit garder le même
 * set — voir commentaire dans `stream/timeline/phases.js`.
 *
 * Chrome Copilot conservé : pas de phase-blocks TUI côté Agents ; seule la
 * *classification* du texte streamé est partagée.
 */

/** Phases dont le texte streamé va dans le fold thinking (pas la réponse user). */
export const DROX_THINKING_PHASES: ReadonlySet<string> = new Set([
	'internal_reasoning',
	'reasoning',
	'reading',
	'analyzing',
	'acting',
	'planning',
	'verifying',
	'testing',
	'clarifying',
]);

export function isDroxAnsweringPhase(phase: string | null | undefined): boolean {
	return phase === 'answering';
}

/**
 * `true` → routage thinking ; `false` → markdown / answer visible.
 * - `answering` → visible
 * - phase inconnue / null / hors `done` → thinking (défensif)
 * - `done` → pas de stream texte attendu ; traité comme non-thinking
 */
export function isDroxThinkingRoute(phase: string | null | undefined): boolean {
	if (isDroxAnsweringPhase(phase)) {
		return false;
	}
	if (!phase) {
		return true;
	}
	// Inconnu hors `done` → thinking (défensif) ; set wide = phases métier hors answering.
	return DROX_THINKING_PHASES.has(phase) || phase !== 'done';
}
