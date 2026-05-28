/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import {
	formatPermissionDialogContent,
	isPermissionToolAsk,
	permissionYesNoOptionIds,
	shouldAutoAllowPermissionAsk,
} from '../common/droxPermissionAsk.js';
import {
	DroxUserAskHostMessage,
	IDroxUserAskAnswer,
	IDroxUserAskAnswerMessage,
	IDroxUserAskPayload,
	parseUserAskParams,
} from '../common/droxUserAsk.js';
import { IDroxUserAskService } from '../common/droxUserAskService.js';
import { IDroxEngineService } from '../common/droxEngineService.js';
import { RpcRequestResult } from '../common/droxRpc.js';

interface IPendingUserAsk {
	readonly askId: string;
	readonly questions: Array<{ id: string; options: Array<{ id: string }> }>;
	readonly resolve: (answers: IDroxUserAskAnswer[]) => void;
}

const DETAIL_MAX = 4000;

export class DroxUserAskService extends Disposable implements IDroxUserAskService {

	declare readonly _serviceBrand: undefined;

	private _post?: (message: DroxUserAskHostMessage) => void;
	private _pending?: IPendingUserAsk;
	private _activePermissionMode: string | undefined;

	private readonly _onDidChangePending = this._register(new Emitter<boolean>());
	readonly onDidChangePending: Event<boolean> = this._onDidChangePending.event;

	get hasPending(): boolean {
		return !!this._pending;
	}

	constructor(
		@IDroxEngineService droxEngineService: IDroxEngineService,
		@IDialogService private readonly dialogService: IDialogService,
	) {
		super();
		droxEngineService.setRequestHandler('user/ask', params => this.handleUserAsk(params));
	}

	attachWebview(post: (message: DroxUserAskHostMessage) => void): void {
		this._post = post;
	}

	handleWebviewAnswer(raw: unknown): void {
		const msg = raw as IDroxUserAskAnswerMessage | undefined;
		if (!msg || msg.type !== 'userAskAnswer') {
			return;
		}
		const pending = this._pending;
		if (!pending) {
			return;
		}
		if (typeof msg.askId === 'string' && msg.askId !== pending.askId) {
			return;
		}
		const provided = Array.isArray(msg.answers) ? msg.answers : [];
		const byId = new Map(provided.map(a => [a.id, a]));
		const answers = pending.questions.map(q => {
			const a = byId.get(q.id);
			const optionIds = Array.isArray(a?.optionIds) ? a!.optionIds : [];
			const validIds = new Set(q.options.map(o => o.id));
			return {
				id: q.id,
				optionIds: optionIds.filter(id => validIds.has(id)),
				freeText: typeof a?.freeText === 'string' ? a.freeText : '',
				skipped: Boolean(a?.skipped),
			};
		});
		this.clearPending();
		pending.resolve(answers);
	}

	resolvePendingAsSkipped(): void {
		const pending = this._pending;
		if (!pending) {
			return;
		}
		this.clearPending();
		pending.resolve(
			pending.questions.map(q => ({
				id: q.id,
				optionIds: [],
				freeText: '',
				skipped: true,
			})),
		);
	}

	setActivePermissionMode(mode: string | undefined): void {
		this._activePermissionMode = mode;
	}

	getActivePermissionMode(): string | undefined {
		return this._activePermissionMode;
	}

	private clearPending(): void {
		if (this._pending) {
			this._pending = undefined;
			this._onDidChangePending.fire(false);
			this._post?.({ kind: 'userAskClose' });
		}
	}

	private async handleUserAsk(params: unknown): Promise<RpcRequestResult> {
		const parsed = parseUserAskParams(params);
		if ('error' in parsed) {
			return { error: { code: -32602, message: parsed.error } };
		}

		if (this._pending) {
			this.resolvePendingAsSkipped();
		}

		if (isPermissionToolAsk(parsed)) {
			return this.handlePermissionAsk(parsed);
		}

		return this.handleBlockingAsk(parsed);
	}

	/** Dialogue natif oui/non pour une permission tool (mode `default`, règles Ask). */
	private async handlePermissionAsk(parsed: IDroxUserAskPayload): Promise<RpcRequestResult> {
		const q = parsed.questions[0]!;
		const { yesId, noId } = permissionYesNoOptionIds(q);
		if (shouldAutoAllowPermissionAsk(this._activePermissionMode)) {
			return {
				result: {
					answers: [{
						id: q.id,
						optionIds: [yesId],
						freeText: '',
						skipped: false,
					}],
				},
			};
		}
		this._onDidChangePending.fire(true);
		try {
			const { titleToolName, detail } = formatPermissionDialogContent(q);
			const message = titleToolName
				? localize('drox.permissionAskTitle', "Allow tool '{0}'?", titleToolName)
				: localize('drox.permissionAskTitleGeneric', 'Allow tool call?');
			const detailText =
				detail.length > DETAIL_MAX ? `${detail.slice(0, DETAIL_MAX)}…` : detail;
			const { confirmed } = await this.dialogService.confirm({
				type: 'question',
				message,
				detail: detailText,
				primaryButton: localize('drox.permissionAllow', 'Allow'),
				cancelButton: localize('drox.permissionDeny', 'Deny'),
			});
			const answers: IDroxUserAskAnswer[] = [{
				id: q.id,
				optionIds: confirmed ? [yesId] : [noId],
				freeText: '',
				skipped: false,
			}];
			return { result: { answers } };
		} finally {
			this._onDidChangePending.fire(false);
		}
	}

	/** Carte webview multi-questions (`ask_user_question`). */
	private async handleBlockingAsk(parsed: IDroxUserAskPayload): Promise<RpcRequestResult> {
		this._post?.({
			kind: 'userAsk',
			askId: parsed.askId,
			runId: parsed.runId,
			title: parsed.title,
			questions: parsed.questions,
		});
		this._onDidChangePending.fire(true);

		const answers = await new Promise<IDroxUserAskAnswer[]>(resolve => {
			this._pending = {
				askId: parsed.askId,
				questions: parsed.questions.map(q => ({
					id: q.id,
					options: q.options.map(o => ({ id: o.id })),
				})),
				resolve,
			};
		});

		return { result: { answers } };
	}
}
