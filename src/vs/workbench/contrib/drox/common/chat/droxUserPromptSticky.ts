/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

export const USER_PROMPT_STICKY_MAX_CHARS = 140;

export interface IDroxUserPromptStickyPayload {
	readonly text: string;
	readonly meta?: string;
	readonly fullText: string;
}

export function truncateUserPromptStickyText(text: string, max = USER_PROMPT_STICKY_MAX_CHARS): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length <= max) {
		return normalized;
	}
	return `${normalized.slice(0, max - 1)}…`;
}

/** Titre court de l’onglet session (objectif du run émis par le modèle). */
export function deriveSessionTabTitle(text: string, max = 36): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) {
		return '';
	}
	if (normalized.length <= max) {
		return normalized;
	}
	return `${normalized.slice(0, max - 1)}…`;
}

/**
 * Index du message utilisateur à afficher dans la bulle sticky selon le défilement.
 * `topsAboveAnchor[i] === true` lorsque le haut du message i est au-dessus de la ligne d’ancrage (onglet).
 */
export function pickActiveUserPromptStickyIndex(topsAboveAnchor: readonly boolean[]): number {
	const n = topsAboveAnchor.length;
	if (n === 0) {
		return -1;
	}
	if (topsAboveAnchor.every(Boolean)) {
		return 0;
	}
	for (let i = n - 1; i >= 0; i--) {
		if (!topsAboveAnchor[i]) {
			return i;
		}
	}
	return 0;
}

export function buildUserPromptStickyPayload(
	displayed: string,
	trimmed: string,
	attachmentsCount: number,
): IDroxUserPromptStickyPayload {
	const metaParts: string[] = [];
	if (attachmentsCount > 0) {
		metaParts.push(attachmentsCount === 1 ? '1 image' : `${attachmentsCount} images`);
	}
	const meta = metaParts.length > 0 ? metaParts.join(' · ') : undefined;
	const primary = trimmed.trim();
	if (primary) {
		return {
			text: truncateUserPromptStickyText(primary),
			meta,
			fullText: displayed,
		};
	}
	if (meta) {
		return { text: meta, fullText: displayed || meta };
	}
	return {
		text: truncateUserPromptStickyText(displayed),
		fullText: displayed,
	};
}
