/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**

 * Embeddings pour la memoire longue. Repli lexical si `null` (pas de dependance

 * lourde type @xenova/transformers dans le fork pour l'instant).

 */

export async function droxEmbedText(text: string): Promise<number[] | null> {

	const trimmed = text.trim().slice(0, 8000);

	if (!trimmed) {

		return null;

	}

	// Parite extension : vecteurs 384-d via Transformers.js — a brancher si besoin.

	return null;

}

