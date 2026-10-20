/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Pourquoi le process `drox.exe` est tué / remplacé — toujours loggé côté main. */
export type DroxEngineDisposeReason =
	| 'start-replace'
	| 'respawn-settings'
	| 'respawn-binary'
	| 'shutdown'
	| 'explicit';

export function droxEngineEnvFingerprint(env?: Readonly<Record<string, string>>): string {
	if (!env) {
		return '';
	}
	return Object.keys(env)
		.sort()
		.map(k => `${k}=${env[k] ?? ''}`)
		.join('\n');
}

export function shouldReuseDroxEngineHost(args: {
	readonly existing?: {
		readonly executable: string;
		readonly cwd: string;
		readonly envFingerprint: string;
		readonly alive: boolean;
	};
	readonly nextExecutable: string;
	readonly nextCwd: string;
	readonly nextEnvFingerprint: string;
}): boolean {
	const existing = args.existing;
	if (!existing?.alive) {
		return false;
	}
	return existing.executable === args.nextExecutable
		&& existing.cwd === args.nextCwd
		&& existing.envFingerprint === args.nextEnvFingerprint;
}

/** Pendant un agent.run vivant, seul `shutdown` (fermeture fenêtre) peut tuer le process. */
export function shouldDeferEngineDispose(
	reason: DroxEngineDisposeReason,
	agentRunActive: boolean,
): boolean {
	if (!agentRunActive) {
		return false;
	}
	return reason !== 'shutdown';
}

export function parseAgentDoneRunId(params: unknown): string | undefined {
	if (!params || typeof params !== 'object') {
		return undefined;
	}
	const runId = (params as { runId?: unknown }).runId;
	return typeof runId === 'string' && runId.trim() ? runId.trim() : undefined;
}

/**
 * RPC failed because the main-process `drox.exe` client is gone / was disposed.
 * Callers should restart the engine and retry once (race: exit before `_started` clears).
 */
export function isDroxEngineStaleClientError(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err ?? '');
	const lower = msg.toLowerCase();
	return lower.includes('drox client closed')
		|| lower.includes('drox engine not started')
		|| lower.includes('engine not started for this window');
}
