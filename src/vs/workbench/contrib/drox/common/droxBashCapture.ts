/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extractStdoutAfterDroxBashMarker } from './droxBash.js';

/**
 * IDE bash stdout isolation (pure) — dogfood P0 / lot capture.
 *
 * Revert / évoluer ici sans toucher au runner terminal :
 * - marker slice (SI + buffer)
 * - buffer delta fallback
 * - strip shell chrome (banner cmd / prompt seul)
 * - P0 fiabilité : ne jamais court-circuiter sur « marker présent » si la slice est vide
 */

/** cmd.exe prompt line: `C:\path>` or `C:\path> ` */
const CMD_PROMPT_LINE = /^[A-Za-z]:\\[^>\r\n]*>\s*$/;

/** Leading Windows cmd banner (EN/FR). */
const WINDOWS_CMD_BANNER =
	/^(?:Microsoft Windows|Microsoft Windows \[version[^\]]*\]|\(c\) Microsoft Corporation\.[^\r\n]*)\s*$/i;

/** Echoed stdout marker line (`echo __DROX_BASH_…__`) left in buffer delta. */
const DROX_BASH_MARKER_LINE = /^__DROX_BASH_[A-Za-z0-9_]+__\s*$/;

/**
 * Prefer marker slices (SI, then buffer); only then buffer delta.
 * Among SI vs buffer marker slices, keep the longer non-empty (partial SI vs full buffer).
 *
 * Never short-circuit on « marker present » with an empty slice — that discarded the
 * buffer the live card already showed (cmd.exe `getOutput()` miss).
 * Never prefer raw delta over a marker slice: delta often still contains the marker line.
 */
export function isolateDroxBashCapturedStdout(
	commandDetectionOutput: string,
	marker: string,
	bufferBefore: string,
	bufferAfter: string,
): string {
	const fromDetection = stripDroxBashShellChrome(
		extractStdoutAfterDroxBashMarker(commandDetectionOutput, marker),
	);
	const fromBuffer = stripDroxBashShellChrome(
		extractStdoutAfterDroxBashMarker(bufferAfter, marker),
	);
	if (fromDetection || fromBuffer) {
		return fromDetection.length >= fromBuffer.length ? fromDetection : fromBuffer;
	}
	return stripDroxBashShellChrome(bufferDeltaSinceDroxBash(bufferBefore, bufferAfter));
}

/** Prefer new buffer content only — empty if we cannot isolate this run. */
export function bufferDeltaSinceDroxBash(before: string, after: string): string {
	if (!after) {
		return '';
	}
	if (!before) {
		return after;
	}
	if (after.startsWith(before)) {
		return after.slice(before.length).replace(/^\r?\n/, '');
	}
	if (after.endsWith(before)) {
		return after.slice(0, after.length - before.length).replace(/\r?\n$/, '');
	}
	return '';
}

/**
 * Drop cmd banner / prompt-only noise. If everything left is chrome → `''`
 * (honest empty beats fake "Microsoft Windows…" as git output).
 */
export function stripDroxBashShellChrome(text: string): string {
	if (!text) {
		return '';
	}
	const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
	const kept: string[] = [];
	for (const line of lines) {
		const t = line.trimEnd();
		if (!t) {
			// keep blank lines only between real content
			if (kept.length > 0) {
				kept.push('');
			}
			continue;
		}
		if (WINDOWS_CMD_BANNER.test(t) || CMD_PROMPT_LINE.test(t) || DROX_BASH_MARKER_LINE.test(t)) {
			continue;
		}
		kept.push(line);
	}
	// trim trailing blanks
	while (kept.length > 0 && kept[kept.length - 1] === '') {
		kept.pop();
	}
	// trim leading blanks
	while (kept.length > 0 && kept[0] === '') {
		kept.shift();
	}
	return kept.join('\n');
}
