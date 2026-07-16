/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IChatDroxWarmupPart } from '../../../chat/common/chatService/chatService.js';
import { IChatRendererContent } from '../../../chat/common/model/chatViewModel.js';
import { ChatTreeItem } from '../../../chat/browser/chat.js';
import { appendDroxActivityGrid } from '../droxActivityGrid.js';
import { IChatContentPart, IChatContentPartRenderContext } from '../../../chat/browser/widget/chatContentParts/chatContentParts.js';

export function shouldHideDroxWarmupForFollowingContent(followingContent: ReadonlyArray<IChatRendererContent>): boolean {
	return followingContent.some(part => part.kind !== 'droxWarmup' && part.kind !== 'progressMessage');
}

export class ChatDroxWarmupContentPart extends Disposable implements IChatContentPart {
	public readonly domNode: HTMLElement;
	private readonly _phrase: string;
	private readonly _hidden: boolean;

	constructor(
		content: IChatDroxWarmupPart,
		context: IChatContentPartRenderContext,
	) {
		super();
		this._phrase = content.phrase;
		const followingContent = context.content.slice(context.contentIndex + 1);
		this._hidden = shouldHideDroxWarmupForFollowingContent(followingContent);
		if (this._hidden) {
			this.domNode = dom.$('');
			return;
		}

		this.domNode = dom.$('.activity-warmup.drox-run-warmup');
		this.domNode.setAttribute('role', 'status');
		this.domNode.setAttribute('aria-live', 'polite');
		appendDroxActivityGrid(this.domNode, 'activity-grid activity-grid-inline activity-grid-persistent');
		const label = dom.append(this.domNode, dom.$('.activity-warmup-label'));
		label.textContent = content.phrase;
	}

	hasSameContent(other: IChatRendererContent, followingContent: IChatRendererContent[], _element: ChatTreeItem): boolean {
		if (other.kind !== 'droxWarmup') {
			return false;
		}
		const hidden = shouldHideDroxWarmupForFollowingContent(followingContent);
		return other.phrase === this._phrase && hidden === this._hidden;
	}
}
