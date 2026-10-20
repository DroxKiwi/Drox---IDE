/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * IDE shared agent bash — arbo n+1 (lots réversibles) :
 *
 * | Fichier | Lot | Rôle |
 * |---------|-----|------|
 * | `sharedSession.ts` | session | create / recycle singleton |
 * | `shellReady.ts` | ready | attendre banner+prompt avant snapshot |
 * | `buffer.ts` | capture IDE | lecture xterm |
 * | `activeRun.ts` | skip | latch + Skip / forceInterrupt |
 * | `run.ts` | run | timer + CommandDetection + runCommand |
 * | `common/droxBashCapture.ts` | capture | marker / delta / strip chrome (pur) |
 * | `common/droxBashToolResult.ts` | result | policy `isError` |
 */

export { sanitizeDroxAgentTerminalCwd } from '../../../common/droxBash.js';
export {
	forceInterruptDroxAgentTerminal,
	hasActiveDroxBashInIdeTerminal,
	skipActiveDroxBashInIdeTerminal,
} from './activeRun.js';
export { runDroxBashInIdeTerminal } from './run.js';
