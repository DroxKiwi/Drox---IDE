/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { relative } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IMarker, MarkerSeverity } from '../../../../platform/markers/common/markers.js';

/** Arguments sérialisables pour `workbench.action.droxAddDiagnosticToChat`. */
export interface IDroxDiagnosticToChatPayload {
	readonly uri: string;
	readonly startLine: number;
	readonly startCharacter: number;
	readonly endLine: number;
	readonly endCharacter: number;
	readonly message: string;
	readonly severity: MarkerSeverity;
	readonly code?: string;
}

export function severityLabel(sev: MarkerSeverity): string {
	switch (sev) {
		case MarkerSeverity.Error:
			return localize('drox.diagnostic.severity.error', 'error');
		case MarkerSeverity.Warning:
			return localize('drox.diagnostic.severity.warning', 'warning');
		case MarkerSeverity.Info:
			return localize('drox.diagnostic.severity.info', 'info');
		case MarkerSeverity.Hint:
			return localize('drox.diagnostic.severity.hint', 'hint');
		default:
			return localize('drox.diagnostic.severity.generic', 'diagnostic');
	}
}

function formatMarkerCode(code: IMarker['code'] | undefined): string | undefined {
	if (code === undefined || code === null) {
		return undefined;
	}
	if (typeof code === 'string' || typeof code === 'number') {
		return String(code);
	}
	if (typeof code === 'object' && 'value' in code) {
		return String(code.value);
	}
	return undefined;
}

export function payloadFromMarker(marker: IMarker): IDroxDiagnosticToChatPayload {
	return {
		uri: marker.resource.toString(),
		startLine: marker.startLineNumber - 1,
		startCharacter: marker.startColumn - 1,
		endLine: marker.endLineNumber - 1,
		endCharacter: marker.endColumn - 1,
		message: marker.message,
		severity: marker.severity,
		code: formatMarkerCode(marker.code),
	};
}

/** Texte inséré dans le composer (sans envoi automatique). */
export function formatDiagnosticForComposer(
	uri: URI,
	payload: IDroxDiagnosticToChatPayload,
	workspaceRoot: string | undefined,
): string {
	const fp = uri.fsPath.replace(/\\/g, '/');
	let rel = fp;
	if (workspaceRoot) {
		const ws = workspaceRoot.replace(/\\/g, '/');
		if (fp.startsWith(ws)) {
			rel = relative(ws, fp).replace(/\\/g, '/');
			if (!rel.startsWith('./') && rel !== '..') {
				rel = `./${rel}`;
			}
		}
	}
	const line = payload.startLine + 1;
	const col = payload.startCharacter + 1;
	const sev = severityLabel(payload.severity);
	const lines = [
		`**Diagnostic (${sev})** — \`${rel}:${line}:${col}\``,
		'',
		'```text',
		payload.message,
		'```',
	];
	if (payload.code) {
		lines.push('', `${localize('drox.diagnostic.code', 'Code')}: \`${payload.code}\``);
	}
	lines.push(
		'',
		localize(
			'drox.diagnostic.helpPrompt',
			'Can you help me fix this issue?',
		),
	);
	return lines.join('\n');
}

export function markerContainsPosition(
	marker: IMarker,
	lineNumber: number,
	column: number,
): boolean {
	if (lineNumber < marker.startLineNumber || lineNumber > marker.endLineNumber) {
		return false;
	}
	if (lineNumber === marker.startLineNumber && column < marker.startColumn) {
		return false;
	}
	if (lineNumber === marker.endLineNumber && column > marker.endColumn) {
		return false;
	}
	return true;
}

export function markersAtPosition(
	markers: readonly IMarker[],
	lineNumber: number,
	column: number,
): IMarker[] {
	return markers.filter(m => markerContainsPosition(m, lineNumber, column));
}
