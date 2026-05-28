/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxUserAskPayload, IDroxUserAskQuestion } from './droxUserAsk.js';

/** Modes de permission exposés dans le chat (alignés sur `PermissionMode` moteur). */
export const DROX_PERMISSION_MODES = [
	'analyze',
	'trustEdit',
	'imNotCrazy',
] as const;

export type DroxPermissionMode = (typeof DROX_PERMISSION_MODES)[number];

const LEGACY_MODE_MAP: Record<string, DroxPermissionMode> = {
	default: 'imNotCrazy',
	plan: 'analyze',
	acceptEdits: 'trustEdit',
	bypassPermissions: 'trustEdit',
};

export function normalizeDroxPermissionMode(mode: string | undefined): DroxPermissionMode {
	if (!mode) {
		return 'imNotCrazy';
	}
	if (isValidDroxPermissionMode(mode)) {
		return mode;
	}
	return LEGACY_MODE_MAP[mode] ?? 'imNotCrazy';
}

export function isValidDroxPermissionMode(mode: string): mode is DroxPermissionMode {
	return (DROX_PERMISSION_MODES as readonly string[]).includes(mode);
}

/** Modes où le client ne bloque pas sur une permission tool (`user/ask`) — Trust Edit uniquement. */
export function shouldAutoAllowPermissionAsk(mode: string | undefined): boolean {
	return normalizeDroxPermissionMode(mode) === 'trustEdit';
}

const PERMISSION_ASK_RE = /Allow this `[^`]+` call\?/i;

/**
 * Détecte un `user/ask` émis par `confirm_with_user` (permission Ask du moteur),
 * distinct des cartes « Questions bloquantes » (`ask_user_question`).
 */
export function isPermissionToolAsk(payload: IDroxUserAskPayload): boolean {
	if (payload.questions.length !== 1) {
		return false;
	}
	const q = payload.questions[0];
	if (q.allowMultiple || q.allowFreeText) {
		return false;
	}
	if (!PERMISSION_ASK_RE.test(q.prompt)) {
		return false;
	}
	if (q.options.length !== 2) {
		return false;
	}
	const labels = new Set(q.options.map(o => o.label.trim().toLowerCase()));
	return labels.has('yes') && labels.has('no');
}

export interface IDroxPermissionDialogContent {
	readonly titleToolName: string | undefined;
	readonly detail: string;
}

/** Extrait le message permission et le nom d'outil pour la boîte de dialogue native. */
export function formatPermissionDialogContent(q: IDroxUserAskQuestion): IDroxPermissionDialogContent {
	const toolMatch = /Allow this `([^`]+)` call\?/.exec(q.prompt);
	const titleToolName = toolMatch?.[1];
	const splitIdx = q.prompt.search(/\n\nAllow this `/);
	const detail =
		splitIdx >= 0 ? q.prompt.slice(0, splitIdx).trim() : q.prompt.trim();
	return { titleToolName, detail };
}

/** Id d'option « yes » / « no » pour la réponse RPC attendue par `RpcUserAsker`. */
export function permissionYesNoOptionIds(q: IDroxUserAskQuestion): { yesId: string; noId: string } {
	const yesId =
		q.options.find(o => o.label.trim().toLowerCase() === 'yes')?.id ??
		q.options[0]?.id ??
		'opt1';
	const noId =
		q.options.find(o => o.label.trim().toLowerCase() === 'no')?.id ??
		q.options[1]?.id ??
		'opt2';
	return { yesId, noId };
}
