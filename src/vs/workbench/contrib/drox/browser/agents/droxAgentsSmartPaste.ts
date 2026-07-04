/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../../base/common/event.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IChatRequestVariableEntry } from '../../../chat/common/attachments/chatVariableEntries.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ITerminalService } from '../../../terminal/browser/terminal.js';
import { openDroxPasteSource } from '../chat/droxChatFileActions.js';
import { droxFnv1a32, IDroxPasteCandidateWire, normalizePasteText } from '../../common/droxPasteCandidates.js';
import { IDroxPasteCandidateService } from '../../common/droxPasteCandidateService.js';
import {
	formatDroxSmartPasteChipLabel,
	IDroxSmartPasteAttachmentValue,
	isDroxSmartPasteVariableEntry,
	toDroxSmartPasteVariableEntry,
	wireToDroxSmartPasteAttachmentValue,
} from '../../common/droxNativeChatRequestAttachments.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';

export function registerDroxSmartPasteHandler(
	target: HTMLElement,
	pasteCandidateService: IDroxPasteCandidateService,
	onAttach: (candidate: IDroxPasteCandidateWire, token: string) => void,
	hasToken: (token: string) => boolean,
): IDisposable {
	return dom.addDisposableListener(target, dom.EventType.PASTE, (e: ClipboardEvent) => {
		const dt = e.clipboardData;
		if (!dt) {
			return;
		}
		const items = dt.items;
		if (items) {
			for (const item of Array.from(items)) {
				if (item.kind === 'file' && item.type.startsWith('image/')) {
					return;
				}
			}
		}
		const pasted = dt.getData('text/plain');
		if (!pasted) {
			return;
		}
		const normalized = normalizePasteText(pasted);
		if (!normalized.trim()) {
			return;
		}
		const token = droxFnv1a32(normalized);
		const candidate = pasteCandidateService.resolveCandidateByToken(token);
		if (!candidate) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		if (hasToken(token)) {
			return;
		}
		onAttach(candidate, token);
	}, true);
}

interface IDroxSmartPasteAttachment extends IDroxSmartPasteAttachmentValue {
	readonly id: string;
}

export class DroxAgentsSmartPasteController extends Disposable {

	private readonly pastes: IDroxSmartPasteAttachment[] = [];
	private _container: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		@IDroxPasteCandidateService private readonly pasteCandidateService: IDroxPasteCandidateService,
		@IEditorService private readonly editorService: IEditorService,
		@ITerminalService private readonly terminalService: ITerminalService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	render(container: HTMLElement): void {
		this._container = container;
		this._updateRendering();
	}

	registerPasteHandler(element: HTMLElement): void {
		this._register(registerDroxSmartPasteHandler(
			element,
			this.pasteCandidateService,
			(candidate, token) => this._addPaste(candidate, token),
			token => this.pastes.some(p => p.token === token),
		));
	}

	onFocus(): void {
		this.pasteCandidateService.resync();
	}

	get attachments(): readonly IDroxSmartPasteAttachment[] {
		return this.pastes;
	}

	hasPastes(): boolean {
		return this.pastes.length > 0;
	}

	getVariableEntriesForSend(): IChatRequestVariableEntry[] {
		return this.pastes.map(paste => toDroxSmartPasteVariableEntry(paste.id, paste));
	}

	setFromVariableEntries(entries: readonly IChatRequestVariableEntry[]): void {
		this.pastes.length = 0;
		for (const entry of entries) {
			if (!isDroxSmartPasteVariableEntry(entry)) {
				continue;
			}
			const value = entry.value;
			if (!value || typeof value !== 'object') {
				continue;
			}
			const paste = value as Partial<IDroxSmartPasteAttachmentValue>;
			if (typeof paste.token !== 'string' || typeof paste.text !== 'string') {
				continue;
			}
			this.pastes.push({
				id: entry.id,
				token: paste.token,
				kind: paste.kind === 'terminal' ? 'terminal' : 'editor',
				absPath: typeof paste.absPath === 'string' ? paste.absPath : '',
				relPath: typeof paste.relPath === 'string' ? paste.relPath : paste.relPath === null ? null : null,
				languageId: typeof paste.languageId === 'string' ? paste.languageId : 'plaintext',
				startLine: typeof paste.startLine === 'number' ? paste.startLine : 1,
				endLine: typeof paste.endLine === 'number' ? paste.endLine : 1,
				lineCount: typeof paste.lineCount === 'number' ? paste.lineCount : 1,
				text: paste.text,
			});
		}
		this._updateRendering();
		this._onDidChange.fire();
	}

	clear(): void {
		if (this.pastes.length === 0) {
			return;
		}
		this.pastes.length = 0;
		this._updateRendering();
		this._onDidChange.fire();
	}

	private _addPaste(candidate: IDroxPasteCandidateWire, token: string): void {
		if (this.pastes.some(p => p.token === token)) {
			return;
		}
		this.pastes.push({
			id: `drox-paste-${generateUuid()}`,
			...wireToDroxSmartPasteAttachmentValue(candidate),
		});
		this._updateRendering();
		this._onDidChange.fire();
	}

	private _removePaste(id: string): void {
		const index = this.pastes.findIndex(p => p.id === id);
		if (index === -1) {
			return;
		}
		this.pastes.splice(index, 1);
		this._updateRendering();
		this._onDidChange.fire();
	}

	private _updateRendering(): void {
		if (!this._container) {
			return;
		}

		this._renderDisposables.clear();
		dom.clearNode(this._container);

		if (this.pastes.length === 0) {
			this._container.style.display = 'none';
			return;
		}

		this._container.style.display = '';
		for (const paste of this.pastes) {
			const chip = dom.append(this._container, dom.$('.sessions-chat-paste-chip'));
			if (paste.kind === 'terminal') {
				chip.classList.add('sessions-chat-paste-chip-terminal');
			}

			const icon = dom.append(chip, dom.$('.sessions-chat-paste-chip-icon'));
			icon.appendChild(renderIcon(paste.kind === 'terminal' ? Codicon.terminal : Codicon.code));

			const labelButton = dom.append(chip, dom.$('button.sessions-chat-paste-chip-label')) as HTMLButtonElement;
			labelButton.type = 'button';
			labelButton.textContent = formatDroxSmartPasteChipLabel(paste);
			labelButton.title = formatDroxSmartPasteChipLabel(paste);
			this._renderDisposables.add(dom.addDisposableListener(labelButton, dom.EventType.CLICK, () => {
				void openDroxPasteSource(
					{ post: () => { }, workspaceRoot: () => undefined, workspaceUri: () => undefined },
					this.editorService,
					this.terminalService,
					this.logService,
					{
						kind: paste.kind,
						absPath: paste.absPath,
						relPath: paste.relPath,
						startLine: paste.startLine,
						endLine: paste.endLine,
					},
				);
			}));

			const remove = dom.append(chip, dom.$('.sessions-chat-paste-chip-remove'));
			remove.appendChild(renderIcon(Codicon.close));
			remove.title = 'Remove';
			this._renderDisposables.add(dom.addDisposableListener(remove, dom.EventType.CLICK, () => {
				this._removePaste(paste.id);
			}));
		}
	}
}
