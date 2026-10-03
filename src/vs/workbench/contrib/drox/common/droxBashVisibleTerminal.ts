/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Heuristic: should this bash command open/reveal a panel terminal (Cursor-style)?
 * Short one-shots stay in a hidden agent session; long-running / servers are revealed.
 */
export function droxBashShouldRevealTerminal(command: string): boolean {
	const c = command.trim().toLowerCase();
	if (!c) {
		return false;
	}
	// Explicit background / watch signals
	if (/(^|[\s;&|])(&\s*$)/.test(c)) {
		return true;
	}
	if (/\b--watch\b|\b-w\b.*watch|\bwatch\b/.test(c) && !/\bgit\b/.test(c)) {
		return true;
	}
	// Package-manager / frontend dev servers
	if (/\b(npm|pnpm|yarn|bun)\s+(run\s+)?(dev|start|serve|preview)\b/.test(c)) {
		return true;
	}
	if (/\b(npx|pnpm\s+dlx|yarn\s+dlx|bunx)\s+/.test(c) && /\b(vite|next|nuxt|astro|webpack-dev-server|remix|expo)\b/.test(c)) {
		return true;
	}
	if (/\b(next|vite|nuxt|astro)\s+dev\b/.test(c)) {
		return true;
	}
	if (/\bng\s+serve\b/.test(c)) {
		return true;
	}
	// Docker / compose that stays up (not one-shot ps/logs)
	if (/\bdocker\s+compose\s+up\b/.test(c) && !/\b(-d|--detach)\b/.test(c)) {
		return true;
	}
	if (/\bdocker\s+run\b/.test(c) && !/\b(-d|--detach)\b/.test(c) && !/\b--rm\b/.test(c)) {
		return true;
	}
	// Language runtimes servers
	if (/\b(uvicorn|gunicorn|hypercorn)\b/.test(c)) {
		return true;
	}
	if (/\bflask\s+run\b/.test(c) || /\bpython\s+-m\s+http\.server\b/.test(c)) {
		return true;
	}
	if (/\bcargo\s+watch\b|\bnodemon\b|\btsx\s+watch\b|\bts-node-dev\b/.test(c)) {
		return true;
	}
	if (/\bwebpack\s+serve\b|\bstorybook\s+dev\b/.test(c)) {
		return true;
	}
	return false;
}
