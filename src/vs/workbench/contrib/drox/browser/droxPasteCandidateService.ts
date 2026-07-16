/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { Emitter } from '../../../../base/common/event.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import {
	DROX_PASTE_MAX_CANDIDATES,
	DROX_PASTE_MAX_TEXT_LENGTH,
	DROX_TERMINAL_SMART_PASTE_ABS_SENTINEL,
	droxFnv1a32,
	IDroxPasteCandidate,
	IDroxPasteCandidateWire,
	normalizePasteText,
	toPasteCandidateWire,
} from '../common/droxPasteCandidates.js';
import { IDroxPasteCandidateService } from '../common/droxPasteCandidateService.js';

function toRelPath(absFsPath: string, workspaceRoot: string | undefined): string | null {
	if (!workspaceRoot) {
		return null;
	}
	const ws = workspaceRoot.replaceAll('\\', '/');
	const p = absFsPath.replaceAll('\\', '/');
	if (p === ws || p.startsWith(ws + '/')) {
		return p.slice(ws.length).replace(/^\/+/, '');
	}
	return null;
}

export class DroxPasteCandidateService extends Disposable implements IDroxPasteCandidateService {
	declare readonly _serviceBrand: undefined;

	private readonly candidates = new Map<string, IDroxPasteCandidate>();
	private readonly _onDidUpdate = this._register(new Emitter<IDroxPasteCandidateWire>());
	readonly onDidUpdate = this._onDidUpdate.event;

	constructor(
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@ITerminalService private readonly terminalService: ITerminalService,
	) {
		super();

		for (const editor of this.codeEditorService.listCodeEditors()) {
			this.trackEditor(editor);
		}
		this._register(this.codeEditorService.onCodeEditorAdd(editor => this.trackEditor(editor)));

		this._register(this.terminalService.onAnyInstanceSelectionChange(instance => {
			this.handleTerminalSelection(instance);
		}));
	}

	resync(): void {
		for (const c of this.candidates.values()) {
			this._onDidUpdate.fire(toPasteCandidateWire(c));
		}
	}

	resolveCandidateByToken(token: string): IDroxPasteCandidateWire | undefined {
		const candidate = this.candidates.get(token);
		return candidate ? toPasteCandidateWire(candidate) : undefined;
	}

	private workspaceRoot(): string | undefined {
		return this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
	}

	private trackEditor(editor: ICodeEditor): void {
		const store = this._register(new DisposableStore());
		store.add(editor.onDidChangeCursorSelection(() => this.handleEditorSelection(editor)));
	}

	private pushCandidate(candidate: IDroxPasteCandidate): void {
		const token = candidate.token;
		if (this.candidates.has(token)) {
			const existing = this.candidates.get(token)!;
			this.candidates.delete(token);
			this.candidates.set(token, existing);
			return;
		}

		this.candidates.set(token, candidate);
		while (this.candidates.size > DROX_PASTE_MAX_CANDIDATES) {
			const oldest = this.candidates.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			this.candidates.delete(oldest);
		}

		this._onDidUpdate.fire(toPasteCandidateWire(candidate));
	}

	private handleEditorSelection(editor: ICodeEditor): void {
		const model = editor.getModel();
		if (!model || model.uri.scheme !== Schemas.file) {
			return;
		}
		const sel = editor.getSelection();
		if (!sel || sel.isEmpty()) {
			return;
		}
		const text = model.getValueInRange(sel);
		if (!text || text.length > DROX_PASTE_MAX_TEXT_LENGTH) {
			return;
		}
		const normalized = normalizePasteText(text);
		if (normalized.trim().length === 0) {
			return;
		}
		const token = droxFnv1a32(normalized);
		if (this.candidates.has(token)) {
			const existing = this.candidates.get(token)!;
			this.candidates.delete(token);
			this.candidates.set(token, existing);
			return;
		}

		const startLine = sel.startLineNumber;
		const endLine = sel.endLineNumber;
		const absPath = model.uri.fsPath;
		const wsRoot = this.workspaceRoot();

		this.pushCandidate({
			id: generateUuid(),
			kind: 'editor',
			token,
			absPath,
			relPath: toRelPath(absPath, wsRoot),
			languageId: model.getLanguageId() || 'plaintext',
			startLine,
			endLine,
			lineCount: endLine - startLine + 1,
			text,
		});
	}

	private handleTerminalSelection(instance: ITerminalInstance): void {
		const text = instance.selection ?? '';
		if (!text || text.length > DROX_PASTE_MAX_TEXT_LENGTH) {
			return;
		}
		const normalized = normalizePasteText(text);
		if (normalized.trim().length === 0) {
			return;
		}
		const token = droxFnv1a32(normalized);
		if (this.candidates.has(token)) {
			const existing = this.candidates.get(token)!;
			this.candidates.delete(token);
			this.candidates.set(token, existing);
			return;
		}

		const lines = text.split(/\r?\n/);
		const lineCount = Math.max(1, lines.length);

		this.pushCandidate({
			id: generateUuid(),
			kind: 'terminal',
			token,
			absPath: DROX_TERMINAL_SMART_PASTE_ABS_SENTINEL,
			relPath: instance.title,
			languageId: 'shellsession',
			startLine: 1,
			endLine: lineCount,
			lineCount,
			text,
		});
	}
}
