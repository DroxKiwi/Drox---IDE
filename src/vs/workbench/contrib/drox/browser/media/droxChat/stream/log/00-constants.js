/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	const fn = D.fn;
	const c = D.streamLog = D.streamLog || {};
	/** Phases affichées au même retrait que les outils (Read, Ran, …). */
	c.INDENTED_PHASES = new Set(['reasoning', 'internal_reasoning']);
	/** Phases regroupées dans un seul bloc « Exploring » (lecture + réflexion native). */
	c.EXPLORE_PHASES = new Set(['analyzing', 'reading', 'acting', 'internal_reasoning', 'reasoning']);
	c.EXPLORE_REASONING_PHASES = new Set(['internal_reasoning', 'reasoning']);
	c.DISCUSSION_DONE_MARKER = /\[discussion:\s*done\]\s*/i;
	/** Prose assistant dans Exploring = réflexion (jamais promue telle quelle vers le fil). */
	c.EXPLORE_INTERNAL_PROSE_PHASES = c.EXPLORE_PHASES;
	c.EXPLORE_READ_VERBS = new Set(['Read', 'Wrote', 'Edited', 'Edited notebook', 'Fetched']);
	c.EXPLORE_SEARCH_VERBS = new Set(['Searched', 'Searched web', 'Listed', 'LSP search symbol', 'LSP diagnostics']);
	/** Taille minimale pour traiter un bloc assistant comme réponse finale utilisateur. */
	c.FINAL_ANSWER_MIN_CHARS = 40;
})(globalThis.DroxChat);
