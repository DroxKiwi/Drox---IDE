/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IReference } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Hover, Location, LocationLink } from '../../../../../editor/common/languages.js';
import { ITextModelService, IResolvedTextEditorModel } from '../../../../../editor/common/services/resolverService.js';
import { IWorkspaceSymbol } from '../../../search/common/search.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IMarkerService, MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { IDroxToolExecParams, IDroxToolExecResult } from '../../common/droxClientTools.js';
import {
	clampLspResults,
	DROX_LSP_HOVER_MAX_CHARS,
	IDroxLspInput,
	markerCodeToString,
	markerSeverityName,
	parseDroxLspInput,
	relPathFromWorkspace,
	resolveDroxLspFileUri,
	serializeLspRange,
	symbolKindName,
} from '../../common/droxLsp.js';

function normalizeLocations(
	raw: ReadonlyArray<Location | LocationLink | unknown>,
): Array<{ uri: URI; range: Range }> {
	const out: Array<{ uri: URI; range: Range }> = [];
	for (const l of raw) {
		if (!l || typeof l !== 'object') {
			continue;
		}
		const o = l as Record<string, unknown>;
		if (URI.isUri(o.targetUri) && Range.isIRange(o.targetRange)) {
			out.push({ uri: o.targetUri, range: Range.lift(o.targetRange) });
			continue;
		}
		if (URI.isUri(o.uri) && Range.isIRange(o.range)) {
			out.push({ uri: o.uri, range: Range.lift(o.range) });
		}
	}
	return out;
}

function hoverContentText(h: Hover): string {
	return h.contents
		.map((c: IMarkdownString) => String(c.value ?? ''))
		.filter(Boolean)
		.join('\n\n');
}

async function resolveSymbolPosition(
	textModelService: ITextModelService,
	uri: URI,
	symbol: string,
): Promise<Position> {
	const trimmed = symbol.trim();
	if (!trimmed) {
		throw new Error('lsp: `symbol` must not be empty');
	}
	const ref: IReference<IResolvedTextEditorModel> = await textModelService.createModelReference(uri);
	try {
		const doc = ref.object.textEditorModel;
		const text = doc.getValue();
		const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const rx = /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)
			? new RegExp(`\\b${escaped}\\b`)
			: new RegExp(escaped);
		const m = rx.exec(text);
		if (!m) {
			throw new Error(
				`lsp: symbol \`${trimmed}\` not found in ${uri.fsPath}`,
			);
		}
		return doc.getPositionAt(m.index);
	} finally {
		ref.dispose();
	}
}

async function resolvePosition(
	textModelService: ITextModelService,
	workspace: string,
	input: IDroxLspInput,
): Promise<{ uri: URI; pos: Position }> {
	if (!input.path) {
		throw new Error('lsp: this op requires `path`');
	}
	const uri = resolveDroxLspFileUri(workspace, input.path);
	if (input.position) {
		return {
			uri,
			pos: new Position(input.position.line, input.position.character),
		};
	}
	if (input.symbol) {
		const pos = await resolveSymbolPosition(textModelService, uri, input.symbol);
		return { uri, pos };
	}
	throw new Error('lsp: this op requires either `position` or `symbol`');
}

async function execDiagnostics(
	markerService: IMarkerService,
	workspace: string,
	input: IDroxLspInput,
): Promise<IDroxToolExecResult> {
	const max = clampLspResults(input.max_results);
	const results: Array<{
		path: string;
		severity: string;
		message: string;
		range: ReturnType<typeof serializeLspRange>;
		source?: string;
		code?: string;
	}> = [];
	let total = 0;

	const pushMarker = (resource: URI, m: {
		severity: MarkerSeverity;
		message: string;
		startLineNumber: number;
		startColumn: number;
		endLineNumber: number;
		endColumn: number;
		source?: string;
		code?: string | { value: string; target: URI };
	}) => {
		total++;
		if (results.length >= max) {
			return;
		}
		results.push({
			path: relPathFromWorkspace(workspace, resource),
			severity: markerSeverityName(m.severity),
			message: m.message,
			range: serializeLspRange({
				startLineNumber: m.startLineNumber,
				startColumn: m.startColumn,
				endLineNumber: m.endLineNumber,
				endColumn: m.endColumn,
			}),
			source: m.source,
			code: markerCodeToString(m.code),
		});
	};

	if (input.path) {
		const uri = resolveDroxLspFileUri(workspace, input.path);
		for (const m of markerService.read({ resource: uri })) {
			pushMarker(m.resource, m);
		}
	} else {
		for (const m of markerService.read()) {
			pushMarker(m.resource, m);
		}
	}

	return {
		output: {
			op: 'diagnostics',
			scope: input.path ?? '(workspace)',
			total,
			result_count: results.length,
			truncated: total > results.length,
			results,
			hint:
				results.length === 0 && total === 0
					? 'No diagnostics. The language server may not be ready yet — wait a few seconds after a change.'
					: undefined,
		},
	};
}

async function execWorkspaceSymbol(
	commandService: ICommandService,
	workspace: string,
	input: IDroxLspInput,
): Promise<IDroxToolExecResult> {
	const query = (input.query ?? input.symbol ?? '').trim();
	if (!query) {
		throw new Error('lsp: `workspace_symbol` requires `query` (or `symbol`)');
	}
	const max = clampLspResults(input.max_results);
	const raw =
		(await commandService.executeCommand<IWorkspaceSymbol[]>(
			'vscode.executeWorkspaceSymbolProvider',
			query,
		)) ?? [];
	const results = raw.slice(0, max).map((s: IWorkspaceSymbol) => ({
		name: s.name,
		kind: symbolKindName(s.kind),
		container: s.containerName || undefined,
		location: {
			path: relPathFromWorkspace(workspace, s.location.uri),
			range: serializeLspRange(s.location.range),
		},
	}));
	return {
		output: {
			op: 'workspace_symbol',
			query,
			total: raw.length,
			result_count: results.length,
			truncated: raw.length > results.length,
			results,
		},
	};
}

async function execLocations(
	commandService: ICommandService,
	textModelService: ITextModelService,
	workspace: string,
	input: IDroxLspInput,
	op: 'definition' | 'references',
): Promise<IDroxToolExecResult> {
	const { uri, pos } = await resolvePosition(textModelService, workspace, input);
	const command =
		op === 'definition'
			? 'vscode.executeDefinitionProvider'
			: 'vscode.executeReferenceProvider';
	const raw =
		(await commandService.executeCommand<Array<Location | LocationLink>>(
			command,
			uri,
			pos,
		)) ?? [];
	const normalized = normalizeLocations(raw);
	const max = clampLspResults(input.max_results);
	const results = normalized.slice(0, max).map(l => ({
		path: relPathFromWorkspace(workspace, l.uri),
		range: serializeLspRange(l.range),
	}));
	return {
		output: {
			op,
			origin: {
				path: relPathFromWorkspace(workspace, uri),
				position: { line: pos.lineNumber, character: pos.column },
			},
			total: normalized.length,
			result_count: results.length,
			truncated: normalized.length > results.length,
			results,
		},
	};
}

async function execHover(
	commandService: ICommandService,
	textModelService: ITextModelService,
	workspace: string,
	input: IDroxLspInput,
): Promise<IDroxToolExecResult> {
	const { uri, pos } = await resolvePosition(textModelService, workspace, input);
	const raw =
		(await commandService.executeCommand<Hover[]>(
			'vscode.executeHoverProvider',
			uri,
			pos,
		)) ?? [];
	let text = raw.map(hoverContentText).filter(Boolean).join('\n\n').trim();
	const truncated = text.length > DROX_LSP_HOVER_MAX_CHARS;
	if (truncated) {
		text = `${text.slice(0, DROX_LSP_HOVER_MAX_CHARS)}\n…[truncated]`;
	}
	return {
		output: {
			op: 'hover',
			origin: {
				path: relPathFromWorkspace(workspace, uri),
				position: { line: pos.lineNumber, character: pos.column },
			},
			hover_count: raw.length,
			content: text,
			truncated,
		},
	};
}

export function createDroxLspToolHandler(
	commandService: ICommandService,
	markerService: IMarkerService,
	textModelService: ITextModelService,
): (params: IDroxToolExecParams) => Promise<IDroxToolExecResult> {
	return async (params: IDroxToolExecParams): Promise<IDroxToolExecResult> => {
		const input = parseDroxLspInput(params.input);
		switch (input.op) {
			case 'diagnostics':
				return execDiagnostics(markerService, params.workspace, input);
			case 'workspace_symbol':
				return execWorkspaceSymbol(commandService, params.workspace, input);
			case 'definition':
				return execLocations(commandService, textModelService, params.workspace, input, 'definition');
			case 'references':
				return execLocations(commandService, textModelService, params.workspace, input, 'references');
			case 'hover':
				return execHover(commandService, textModelService, params.workspace, input);
			default: {
				const exhaustive: never = input.op;
				throw new Error(`lsp: unhandled op ${String(exhaustive)}`);
			}
		}
	};
}
