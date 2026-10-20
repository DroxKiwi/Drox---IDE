/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxBashExecResult } from './droxBash.js';
import { droxBashShouldRevealTerminal } from './droxBashVisibleTerminal.js';

/**
 * Policy `isError` pour le tool bash → modèle (lot result).
 *
 * Revert / évoluer ici sans toucher capture ni runner IDE.
 *
 * Règles actuelles (dogfood) :
 * - `error` / `skipped` → erreur
 * - `timed_out` → erreur (le modèle doit voir la coupure)
 * - `exit_code` numérique ≠ 0 → erreur
 * - `exit_code` null → **pas** d’erreur à lui seul (inconnu ≠ échec ; stdout utile OK)
 */
export function droxBashResultIsToolError(result: IDroxBashExecResult): boolean {
	if (result.error || result.skipped) {
		return true;
	}
	if (result.timed_out) {
		return true;
	}
	if (typeof result.exit_code === 'number' && result.exit_code !== 0) {
		return true;
	}
	return false;
}

/**
 * P1 fiabilité : IDE a tourné (`terminal_instance_id`) mais stdout/stderr vides
 * → un retry ExecBash (capture process fiable).
 *
 * Bornes (éviter double mutation / double serveur) :
 * - pas skipped / timed_out / error
 * - pas reveal (serveurs déjà lancés dans le terminal partagé)
 * - pas de redirect fichier (`>` / `>>`, hors `2>&1`) ni mutateurs courants
 */
export function droxBashShouldRetryExecBashAfterIde(
	result: IDroxBashExecResult,
	command: string,
): boolean {
	if (result.skipped || result.timed_out || result.error) {
		return false;
	}
	if (typeof result.terminal_instance_id !== 'number') {
		return false;
	}
	if ((result.stdout ?? '').trim() || (result.stderr ?? '').trim()) {
		return false;
	}
	if (droxBashShouldRevealTerminal(command)) {
		return false;
	}
	const c = command.trim();
	if (!c) {
		return false;
	}
	// File redirects (allow `2>&1` / `>&2`).
	if (/(^|[^12])>{1,2}\s*[^&\s]/.test(c)) {
		return false;
	}
	if (
		/\b(rm|del|erase|move|copy|xcopy|robocopy|mkdir|md|rd|rmdir|ri|set-content|add-content|out-file|new-item|remove-item|git\s+add|git\s+commit|git\s+push|git\s+checkout|npm\s+install|pnpm\s+install|yarn\s+add)\b/i.test(
			c,
		)
	) {
		return false;
	}
	return true;
}
