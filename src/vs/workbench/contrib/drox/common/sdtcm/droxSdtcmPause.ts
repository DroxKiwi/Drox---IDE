/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { DROX_SDTCM_PROBE_PHASES, DroxSdtcmProbePhase } from './droxSdtcmConsistency.js';

/** Where a stopped role run will continue. Written beside the map. */
export interface IDroxSdtcmPause {
	readonly mode: 'build' | 'align';
	readonly phase: DroxSdtcmProbePhase;
	readonly file: string;
	readonly phases: readonly DroxSdtcmProbePhase[];
}

/** `skip` the phase is already done, `from` starts at the saved file, `all` runs the phase. */
export function droxSdtcmPhaseAction(pause: IDroxSdtcmPause | undefined, phase: DroxSdtcmProbePhase): 'all' | 'from' | 'skip' {
	if (!pause) {
		return 'all';
	}
	const here = DROX_SDTCM_PROBE_PHASES.indexOf(phase);
	const at = DROX_SDTCM_PROBE_PHASES.indexOf(pause.phase);
	if (here < at) {
		return 'skip';
	}
	if (here > at) {
		return 'all';
	}
	return 'from';
}

/** Files still to do, including the one that was in progress. An unknown file keeps the whole list. */
export function droxSdtcmFilesFrom(files: readonly string[], file: string): string[] {
	const at = files.indexOf(file);
	return at < 0 ? [...files] : files.slice(at);
}

export function parseDroxSdtcmPause(raw: string): IDroxSdtcmPause | undefined {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return undefined;
	}
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const body = value as { mode?: unknown; phase?: unknown; file?: unknown; phases?: unknown };
	if (body.mode !== 'build' && body.mode !== 'align') {
		return undefined;
	}
	if (typeof body.phase !== 'string' || !DROX_SDTCM_PROBE_PHASES.includes(body.phase as DroxSdtcmProbePhase)) {
		return undefined;
	}
	if (typeof body.file !== 'string' || !body.file.trim()) {
		return undefined;
	}
	const phases = Array.isArray(body.phases)
		? DROX_SDTCM_PROBE_PHASES.filter(phase => (body.phases as unknown[]).includes(phase))
		: [];
	if (!phases.length || !phases.includes(body.phase as DroxSdtcmProbePhase)) {
		return undefined;
	}
	return { mode: body.mode, phase: body.phase as DroxSdtcmProbePhase, file: body.file, phases };
}
