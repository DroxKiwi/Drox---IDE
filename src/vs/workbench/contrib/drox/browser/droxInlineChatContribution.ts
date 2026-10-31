/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { $ } from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { EditorOption } from '../../../../editor/common/config/editorOptions.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';
import { ZoneWidget } from '../../../../editor/contrib/zoneWidget/browser/zoneWidget.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { setDroxInlineChatOpener, type IDroxInlineChatOpenRequest } from '../../inlineChat/browser/inlineChatDelegate.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { DroxCommands } from '../common/drox.js';
import {
	buildDroxExplainUserMessage,
	buildDroxInlineChatUserMessage,
	callDroxProseLlm,
	DROX_EXPLAIN_SYSTEM_PROMPT,
	DROX_INLINE_CHAT_SYSTEM_PROMPT,
	formatDroxExplainComment,
	parseDroxExplainParts,
} from '../common/droxInlineChat.js';
import { IDroxEngineService } from '../common/droxEngineService.js';
import { mergeLlmHttpHeaders } from '../common/droxLlmHeaders.js';
import { parseLlmProvider, readLlmProvider, resolveLlmCatalogConnection } from '../common/droxLlmCatalog.js';
import { IDroxRunSettingsService } from '../common/droxRunSettingsService.js';
import './media/droxInlineChat.css';

const CONTRIB_ID = 'editor.contrib.droxInlineChat';

type TabId = 'chat' | 'explain';

interface IChatTurn {
	readonly role: 'user' | 'assistant';
	readonly text: string;
}

class DroxInlineChatZone extends ZoneWidget {

	private readonly root: HTMLElement;
	private readonly body: HTMLElement;
	private readonly inputRow: HTMLElement;
	private readonly input: HTMLTextAreaElement;
	private readonly chatTab: HTMLButtonElement;
	private readonly explainTab: HTMLButtonElement;
	private tab: TabId = 'chat';
	private chatTurns: IChatTurn[] = [];
	private explainText = '';
	private explainReady = false;
	private explainAnchorLine = 1;
	private explainLanguageId = '';
	private seq = 0;
	private readonly commentButton: HTMLButtonElement;

	constructor(
		editor: ICodeEditor,
		private readonly ask: (system: string, user: string) => Promise<string>,
	) {
		super(editor, {
			showFrame: true,
			frameWidth: 1,
			showArrow: false,
			isResizeable: true,
			isAccessible: true,
			keepEditorSelection: true,
			className: 'drox-inline-chat-zone',
			showInHiddenAreas: true,
			ordinal: 50000,
		});
		this.root = $('div.drox-inline-chat');
		const tabs = $('div.drox-inline-chat-tabs');
		this.chatTab = document.createElement('button');
		this.chatTab.type = 'button';
		this.chatTab.className = 'drox-inline-chat-tab';
		this.chatTab.textContent = localize('drox.inlineChat.tab', 'Inline Chat');
		this.explainTab = document.createElement('button');
		this.explainTab.type = 'button';
		this.explainTab.className = 'drox-inline-chat-tab';
		this.explainTab.textContent = localize('drox.inlineChat.explainTab', 'Explain This Code');
		this.chatTab.addEventListener('click', () => this.showTab('chat'));
		this.explainTab.addEventListener('click', () => this.showTab('explain'));
		const close = document.createElement('button');
		close.type = 'button';
		close.className = 'drox-inline-chat-close';
		close.textContent = localize('drox.inlineChat.close', 'Close');
		close.addEventListener('click', () => this.hide());
		tabs.append(this.chatTab, this.explainTab, close);
		this.body = $('div.drox-inline-chat-body');
		this.inputRow = $('div.drox-inline-chat-input');
		this.input = document.createElement('textarea');
		this.input.className = 'drox-inline-chat-field';
		this.input.rows = 2;
		this.input.placeholder = localize('drox.inlineChat.placeholder', 'Ask about the selection');
		this.input.addEventListener('keydown', e => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				e.stopPropagation();
				void this.sendChat();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				e.stopPropagation();
				this.hide();
			}
		});
		const send = document.createElement('button');
		send.type = 'button';
		send.className = 'drox-inline-chat-send';
		send.textContent = localize('drox.inlineChat.send', 'Send');
		send.addEventListener('click', () => void this.sendChat());
		const rerun = document.createElement('button');
		rerun.type = 'button';
		rerun.className = 'drox-inline-chat-rerun';
		rerun.textContent = localize('drox.inlineChat.rerun', 'Relancer');
		rerun.addEventListener('click', () => void this.runExplain());
		this.commentButton = document.createElement('button');
		this.commentButton.type = 'button';
		this.commentButton.className = 'drox-inline-chat-comment';
		this.commentButton.textContent = localize('drox.inlineChat.asComment', 'Ajouter comme commentaire');
		this.commentButton.disabled = true;
		this.commentButton.addEventListener('click', () => this.addExplanationAsComment());
		this.inputRow.append(this.input, send, rerun, this.commentButton);
		this.root.append(tabs, this.body, this.inputRow);
		this.create();
		this.showTab('chat');
	}

	protected override _fillContainer(container: HTMLElement): void {
		container.appendChild(this.root);
	}

	protected override _doLayout(heightInPixel: number, _widthInPixel: number): void {
		this.root.style.height = `${heightInPixel}px`;
	}

	open(request: IDroxInlineChatOpenRequest): void {
		if (!this.editor.hasModel()) {
			return;
		}
		const selection = this.editor.getSelection();
		const line = selection?.startLineNumber ?? this.editor.getPosition()?.lineNumber ?? 1;
		const info = this.editor.getLayoutInfo();
		const margin = info.glyphMarginWidth + info.lineNumbersWidth + info.decorationsWidth;
		if (this.container) {
			this.container.style.paddingLeft = `${margin}px`;
		}
		const lineHeight = this.editor.getOption(EditorOption.lineHeight);
		super.show(new Position(line, 1), Math.max(6, 200 / lineHeight));
		this.showTab(request.tab);
		if (request.tab === 'explain') {
			void this.runExplain();
			return;
		}
		if (request.message) {
			this.input.value = request.message;
			if (request.autoSend) {
				void this.sendChat();
			} else {
				this.input.focus();
			}
		} else {
			this.input.focus();
		}
	}

	private showTab(tab: TabId): void {
		this.tab = tab;
		this.chatTab.setAttribute('aria-pressed', tab === 'chat' ? 'true' : 'false');
		this.explainTab.setAttribute('aria-pressed', tab === 'explain' ? 'true' : 'false');
		this.inputRow.classList.toggle('explain', tab === 'explain');
		this.commentButton.disabled = !this.explainReady;
		this.render();
	}

	private selectionText(): { languageId: string; text: string } {
		const model = this.editor.getModel();
		const selection = this.editor.getSelection();
		if (!model || !selection || selection.isEmpty()) {
			return { languageId: model?.getLanguageId() ?? '', text: '' };
		}
		return { languageId: model.getLanguageId(), text: model.getValueInRange(selection) };
	}

	private render(): void {
		this.body.replaceChildren();
		if (this.tab === 'explain') {
			this.renderExplain();
			return;
		}
		if (!this.chatTurns.length) {
			this.body.textContent = localize('drox.inlineChat.empty', 'Le modèle de la conversation répond ici, sans passer par le chat latéral.');
			return;
		}
		for (const turn of this.chatTurns) {
			const line = document.createElement('div');
			line.className = `drox-inline-chat-turn ${turn.role}`;
			const who = document.createElement('div');
			who.className = 'drox-inline-chat-who';
			who.textContent = turn.role === 'user' ? localize('drox.inlineChat.you', 'Vous') : 'Drox';
			const text = document.createElement('div');
			text.textContent = turn.text;
			line.append(who, text);
			this.body.appendChild(line);
		}
		this.body.scrollTop = this.body.scrollHeight;
	}

	private renderExplain(): void {
		const parts = parseDroxExplainParts(this.explainText);
		if (!parts.length) {
			this.body.textContent = this.explainText;
			return;
		}
		for (const part of parts) {
			const row = document.createElement('div');
			row.className = 'drox-explain-part';
			const head = document.createElement('div');
			head.className = 'drox-explain-part-head';
			const code = document.createElement('code');
			code.className = 'drox-explain-part-code';
			code.textContent = part.code;
			const role = document.createElement('span');
			role.className = 'drox-explain-part-role';
			role.textContent = part.role;
			const text = document.createElement('div');
			text.className = 'drox-explain-part-text';
			text.textContent = part.text;
			head.append(code, role);
			row.append(head, text);
			this.body.appendChild(row);
		}
	}

	private async sendChat(): Promise<void> {
		const question = this.input.value.trim();
		if (!question) {
			return;
		}
		this.input.value = '';
		const snippet = this.selectionText();
		this.chatTurns.push({ role: 'user', text: question });
		this.showTab('chat');
		const seq = ++this.seq;
		const pending: IChatTurn = { role: 'assistant', text: localize('drox.inlineChat.waiting', '…') };
		this.chatTurns.push(pending);
		this.render();
		const answer = await this.ask(
			DROX_INLINE_CHAT_SYSTEM_PROMPT,
			buildDroxInlineChatUserMessage(snippet.languageId, snippet.text, question),
		);
		const idx = this.chatTurns.indexOf(pending);
		if (idx < 0) {
			return;
		}
		if (seq !== this.seq) {
			this.chatTurns.splice(idx, 1);
			return;
		}
		this.chatTurns[idx] = { role: 'assistant', text: answer };
		this.render();
	}

	private async runExplain(): Promise<void> {
		const snippet = this.selectionText();
		const selection = this.editor.getSelection();
		this.explainReady = false;
		this.commentButton.disabled = true;
		this.showTab('explain');
		if (!snippet.text.trim() || !selection) {
			this.explainText = localize('drox.inlineChat.needSelection', 'Sélectionne un fragment de code.');
			this.render();
			return;
		}
		this.explainAnchorLine = selection.startLineNumber;
		this.explainLanguageId = snippet.languageId;
		const seq = ++this.seq;
		this.explainText = localize('drox.inlineChat.waiting', '…');
		this.render();
		const answer = await this.ask(DROX_EXPLAIN_SYSTEM_PROMPT, buildDroxExplainUserMessage(snippet.languageId, snippet.text));
		if (seq !== this.seq) {
			return;
		}
		this.explainText = answer;
		this.explainReady = true;
		this.commentButton.disabled = this.tab !== 'explain';
		this.render();
	}

	private addExplanationAsComment(): void {
		if (!this.explainReady || !this.explainText.trim() || !this.editor.hasModel()) {
			return;
		}
		const comment = formatDroxExplainComment(this.explainLanguageId, this.explainText);
		this.editor.executeEdits('drox-explain', [{
			range: new Range(this.explainAnchorLine, 1, this.explainAnchorLine, 1),
			text: comment,
		}]);
		this.explainAnchorLine += comment.split('\n').length - 1;
	}
}

export class DroxInlineChatEditorContribution extends Disposable implements IEditorContribution {

	static readonly ID = CONTRIB_ID;

	static get(editor: ICodeEditor): DroxInlineChatEditorContribution | undefined {
		return editor.getContribution<DroxInlineChatEditorContribution>(CONTRIB_ID) ?? undefined;
	}

	private zone: DroxInlineChatZone | undefined;

	constructor(
		private readonly editor: ICodeEditor,
		@IDroxEngineService private readonly engine: IDroxEngineService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IDroxRunSettingsService private readonly runSettings: IDroxRunSettingsService,
	) {
		super();
	}

	open(request: IDroxInlineChatOpenRequest): void {
		if (!this.editor.hasModel() || this.editor.isSimpleWidget) {
			return;
		}
		if (!this.zone) {
			this.zone = this._register(new DroxInlineChatZone(this.editor, (system, user) => this.ask(system, user)));
			this._register(this.editor.onDidChangeModel(() => this.zone?.hide()));
		}
		this.zone.open(request);
	}

	private async ask(system: string, user: string): Promise<string> {
		try {
			await this.engine.initialize();
			const workspace = this.runSettings.getWorkspaceResource();
			const conn = await resolveLlmCatalogConnection(this.configurationService, this.fileService, workspace);
			const model = this.runSettings.getLlmSettings(workspace).model?.trim();
			if (!model || !conn.server.trim()) {
				return localize('drox.inlineChat.noModel', 'Aucun modèle n’est sélectionné dans la conversation.');
			}
			const provider = parseLlmProvider(conn.provider) || readLlmProvider(this.configurationService, workspace);
			const headers = mergeLlmHttpHeaders(conn.apiKey, conn.headers, { provider, server: conn.server });
			const text = await callDroxProseLlm({
				provider,
				server: conn.server,
				model,
				headers,
				fetchHttp: (url, hdrs, options) => this.engine.fetchHttp(url, hdrs, options),
			}, system, user);
			return text || localize('drox.inlineChat.emptyReply', 'Le modèle n’a rien répondu.');
		} catch {
			return localize('drox.inlineChat.failed', 'La requête vers le modèle a échoué.');
		}
	}
}

registerEditorContribution(DroxInlineChatEditorContribution.ID, DroxInlineChatEditorContribution, EditorContributionInstantiation.Lazy);

export class DroxInlineChatWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxInlineChat';

	constructor(@ICodeEditorService codeEditorService: ICodeEditorService) {
		super();
		setDroxInlineChatOpener(async (editor, request) => {
			const target = codeEditorService.listCodeEditors().find(candidate => candidate.getId() === editor.getId()) ?? editor;
			const contrib = DroxInlineChatEditorContribution.get(target);
			if (!contrib) {
				return false;
			}
			contrib.open(request);
			return true;
		});
		this._register({ dispose: () => setDroxInlineChatOpener(undefined) });
	}
}

registerWorkbenchContribution2(DroxInlineChatWorkbenchContribution.ID, DroxInlineChatWorkbenchContribution, WorkbenchPhase.AfterRestored);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: DroxCommands.ExplainThisCode,
			title: localize2('drox.explainThisCode', 'Explain This Code'),
			f1: true,
			precondition: EditorContextKeys.hasNonEmptySelection,
			menu: {
				id: MenuId.EditorContext,
				group: '1_chat',
				order: 4,
				when: ContextKeyExpr.and(EditorContextKeys.hasNonEmptySelection, EditorContextKeys.editorSimpleInput.negate()),
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		const editor = accessor.get(ICodeEditorService).getActiveCodeEditor();
		if (!editor) {
			return;
		}
		DroxInlineChatEditorContribution.get(editor)?.open({ tab: 'explain' });
	}
});
