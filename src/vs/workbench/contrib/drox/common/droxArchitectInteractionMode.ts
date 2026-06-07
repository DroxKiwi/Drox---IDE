/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Aligné sur `ArchitectGate::parse_param` côté moteur (`orchestration_run`). */
export const DROX_ARCHITECT_INTERACTION_MODES = ['auto', 'discussion', 'action'] as const;

export type DroxArchitectInteractionMode = (typeof DROX_ARCHITECT_INTERACTION_MODES)[number];

const LEGACY_MAP: Record<string, DroxArchitectInteractionMode> = {
	discuss: 'discussion',
	chat: 'discussion',
	light: 'discussion',
	edit: 'action',
	agir: 'action',
	agissement: 'action',
	work: 'action',
};

export function normalizeDroxArchitectInteractionMode(
	mode: string | undefined,
): DroxArchitectInteractionMode {
	if (!mode) {
		return 'auto';
	}
	const raw = mode.trim().toLowerCase();
	if (isValidDroxArchitectInteractionMode(raw)) {
		return raw;
	}
	return LEGACY_MAP[raw] ?? 'auto';
}

export function isValidDroxArchitectInteractionMode(
	mode: string,
): mode is DroxArchitectInteractionMode {
	return (DROX_ARCHITECT_INTERACTION_MODES as readonly string[]).includes(mode);
}

/** Valeur à envoyer dans `agent.run` — `auto` = omettre le champ (tour intent modèle). */
export function wireArchitectInteractionMode(
	mode: DroxArchitectInteractionMode,
): string | undefined {
	return mode === 'auto' ? undefined : mode;
}
