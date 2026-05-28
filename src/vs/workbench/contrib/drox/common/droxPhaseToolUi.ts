/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { normalizeToolFinishOutput } from './droxFileMutation.js';

const PHASE_TOOL_NAMES = new Set([
	'phase',
	'phase:',
	'set_phase',
	'phase_transition',
	'reading',
	'read',
	'acting',
	'act',
	'analyzing',
	'analysis',
	'planning',
	'plan',
	'clarifying',
	'answering',
	'answer',
	'verifying',
	'verify',
	'testing',
	'test',
	'done',
]);

export function isHallucinatedPhaseToolName(name: string | undefined): boolean {
	if (!name) {
		return false;
	}
	const n = name.trim().toLowerCase().replace(/:+$/, '');
	return PHASE_TOOL_NAMES.has(n) || n.startsWith('phase');
}

export function isPhaseMarkerToolErrorOutput(output: unknown): boolean {
	const out = normalizeToolFinishOutput(output);
	const err = out?.error;
	if (typeof err !== 'string') {
		return false;
	}
	return /phase markers are (plain text only|not tools)/i.test(err)
		|| err.includes('You tried to invoke a tool named');
}

export function isRecoveredPhaseToolOutput(output: unknown): boolean {
	const out = normalizeToolFinishOutput(output);
	return typeof out?.recovered_phase === 'string' && out.ok === true;
}
