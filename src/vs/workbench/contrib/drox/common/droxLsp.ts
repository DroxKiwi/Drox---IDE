/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { SymbolKind } from '../../../../editor/common/languages.js';
import { MarkerSeverity } from '../../../../platform/markers/common/markers.js';

export type DroxLspOp =
	| 'diagnostics'
	| 'workspace_symbol'
	| 'definition'
	| 'references'
	| 'hover';

export interface IDroxLspPosition {
	line: number;
	character: number;
}

export interface IDroxLspInput {
	op: DroxLspOp;
	path?: string;
	position?: IDroxLspPosition;
	symbol?: string;
	query?: string;
	max_results?: number;
}

export const DROX_LSP_ALLOWED_OPS: readonly DroxLspOp[] = [
	'diagnostics',
	'workspace_symbol',
	'definition',
	'references',
	'hover',
];

export const DROX_LSP_DEFAULT_MAX_RESULTS = 50;
export const DROX_LSP_ABS_MAX_RESULTS = 500;
export const DROX_LSP_HOVER_MAX_CHARS = 4000;

const SYMBOL_KIND_NAMES: Record<number, string> = {
	[SymbolKind.File]: 'file',
	[SymbolKind.Module]: 'module',
	[SymbolKind.Namespace]: 'namespace',
	[SymbolKind.Package]: 'package',
	[SymbolKind.Class]: 'class',
	[SymbolKind.Method]: 'method',
	[SymbolKind.Property]: 'property',
	[SymbolKind.Field]: 'field',
	[SymbolKind.Constructor]: 'constructor',
	[SymbolKind.Enum]: 'enum',
	[SymbolKind.Interface]: 'interface',
	[SymbolKind.Function]: 'function',
	[SymbolKind.Variable]: 'variable',
	[SymbolKind.Constant]: 'constant',
	[SymbolKind.String]: 'string',
	[SymbolKind.Number]: 'number',
	[SymbolKind.Boolean]: 'boolean',
	[SymbolKind.Array]: 'array',
	[SymbolKind.Object]: 'object',
	[SymbolKind.Key]: 'key',
	[SymbolKind.Null]: 'null',
	[SymbolKind.EnumMember]: 'enum_member',
	[SymbolKind.Struct]: 'struct',
	[SymbolKind.Event]: 'event',
	[SymbolKind.Operator]: 'operator',
	[SymbolKind.TypeParameter]: 'type_parameter',
};

export function parseDroxLspInput(input: unknown): IDroxLspInput {
	if (!input || typeof input !== 'object') {
		throw new Error('lsp: input must be an object');
	}
	const o = input as Record<string, unknown>;
	if (typeof o.op !== 'string') {
		throw new Error('lsp: input requires a string `op`');
	}
	if (!DROX_LSP_ALLOWED_OPS.includes(o.op as DroxLspOp)) {
		throw new Error(
			`lsp: unknown op \`${o.op}\` (allowed: ${DROX_LSP_ALLOWED_OPS.join(', ')})`,
		);
	}
	const out: IDroxLspInput = { op: o.op as DroxLspOp };
	if (typeof o.path === 'string') {
		out.path = o.path;
	}
	if (typeof o.symbol === 'string') {
		out.symbol = o.symbol;
	}
	if (typeof o.query === 'string') {
		out.query = o.query;
	}
	if (typeof o.max_results === 'number' && Number.isFinite(o.max_results)) {
		out.max_results = o.max_results;
	}
	if (o.position && typeof o.position === 'object') {
		const p = o.position as Record<string, unknown>;
		if (typeof p.line === 'number' && typeof p.character === 'number') {
			out.position = { line: p.line, character: p.character };
		}
	}
	return out;
}

export function clampLspResults(n: number | undefined): number {
	const raw =
		typeof n === 'number' && Number.isFinite(n) ? n : DROX_LSP_DEFAULT_MAX_RESULTS;
	return Math.max(1, Math.min(DROX_LSP_ABS_MAX_RESULTS, Math.floor(raw)));
}

export function relPathFromWorkspace(workspace: string, uri: URI): string {
	try {
		const r = path.relative(workspace, uri.fsPath);
		if (r && !r.startsWith('..') && !path.isAbsolute(r)) {
			return r.replaceAll('\\', '/');
		}
	} catch {
		// fallthrough
	}
	return uri.fsPath.replaceAll('\\', '/');
}

export function serializeLspRange(range: IRange): { start: IDroxLspPosition; end: IDroxLspPosition } {
	return {
		start: { line: range.startLineNumber, character: range.startColumn },
		end: { line: range.endLineNumber, character: range.endColumn },
	};
}

export function markerSeverityName(sev: MarkerSeverity): string {
	switch (sev) {
		case MarkerSeverity.Error:
			return 'error';
		case MarkerSeverity.Warning:
			return 'warning';
		case MarkerSeverity.Info:
			return 'info';
		case MarkerSeverity.Hint:
			return 'hint';
		default:
			return 'unknown';
	}
}

export function symbolKindName(k: SymbolKind): string {
	return SYMBOL_KIND_NAMES[k] ?? `kind_${k}`;
}

export function markerCodeToString(
	code: string | { value: string; target: URI } | undefined,
): string | undefined {
	if (code === undefined) {
		return undefined;
	}
	if (typeof code === 'string') {
		return code;
	}
	if (typeof code === 'object' && 'value' in code) {
		return String(code.value);
	}
	return undefined;
}

export function resolveDroxLspFileUri(workspace: string, userPath: string): URI {
	const abs = path.isAbsolute(userPath)
		? userPath
		: path.join(workspace, userPath);
	return URI.file(path.normalize(abs));
}
