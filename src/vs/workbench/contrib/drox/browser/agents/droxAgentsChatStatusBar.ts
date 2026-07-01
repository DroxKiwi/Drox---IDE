/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import './media/droxAgentsChatStatusBar.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { formatDroxContextUsageStatFromConfig, formatDroxCycleElapsed } from '../../common/droxChatUiStatsFormat.js';
import { isDroxNativeChatStackEnabled } from '../../common/droxAgentsConfiguration.js';
import { DROX_CHAT_SESSION_TYPE } from '../../common/droxAgentsSession.js';
import { IDroxAgentsChatUiStatsService } from './droxAgentsChatUiStatsService.js';

const $ = dom.$;

export class DroxAgentsChatStatusBar extends Disposable {

	readonly domNode: HTMLElement;

	private readonly _tokInEl: HTMLElement;
	private readonly _tokOutEl: HTMLElement;
	private readonly _cycleEl: HTMLElement;
	private readonly _ctxEl: HTMLElement;

	constructor(
		@IDroxAgentsChatUiStatsService private readonly uiStatsService: IDroxAgentsChatUiStatsService,
	) {
		super();

		this.domNode = $('footer.drox-agents-chat-status.status');
		this.domNode.setAttribute('role', 'status');
		this.domNode.setAttribute('aria-label', localize('droxChatStatusBar', 'Token usage'));

		dom.append(this.domNode, $('.spacer'));

		const tokIn = dom.append(this.domNode, $('span.stat'));
		tokIn.title = localize('droxChatTokensIn', 'Cumulative input tokens this session');
		dom.append(tokIn, $('span')).textContent = '↑ ';
		this._tokInEl = dom.append(tokIn, $('strong'));

		const tokOut = dom.append(this.domNode, $('span.stat'));
		tokOut.title = localize('droxChatTokensOut', 'Cumulative output tokens this session');
		dom.append(tokOut, $('span')).textContent = '↓ ';
		this._tokOutEl = dom.append(tokOut, $('strong'));

		const cycle = dom.append(this.domNode, $('span.stat.stat-cycle'));
		cycle.title = localize('droxChatCycleTime', 'Cycle time since your last message');
		this._cycleEl = dom.append(cycle, $('strong'));
		this._cycleEl.textContent = '00:00:00';

		const ctx = dom.append(this.domNode, $('span.stat.stat-ctx'));
		ctx.title = localize('droxChatCtxUsage', 'Context window usage (used / max)');
		dom.append(ctx, $('span')).textContent = 'ctx ';
		this._ctxEl = dom.append(ctx, $('strong'));

		this._register(this.uiStatsService.onDidChange(() => this._render()));
		this._render();
	}

	private _render(): void {
		const stats = this.uiStatsService.stats;
		this._tokInEl.textContent = String(stats.totalIn);
		this._tokOutEl.textContent = String(stats.totalOut);
		this._cycleEl.textContent = formatDroxCycleElapsed(this.uiStatsService.getCycleElapsedMs());
		this._ctxEl.textContent = formatDroxContextUsageStatFromConfig(
			stats.ctx,
			this.uiStatsService.getNumCtx(),
		);
	}
}

export class DroxAgentsChatStatusBarHost extends Disposable {

	private _statusBar: DroxAgentsChatStatusBar | undefined;
	private readonly _hostDisposables = this._register(new DisposableStore());

	constructor(
		private readonly _host: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
	}

	mountIfNeeded(sessionType: string | undefined): void {
		if (!isDroxNativeChatStackEnabled(this.configurationService) || sessionType !== DROX_CHAT_SESSION_TYPE) {
			this._unmount();
			return;
		}
		if (this._statusBar) {
			return;
		}
		this._hostDisposables.clear();
		this._host.style.display = '';
		const bar = this._hostDisposables.add(this.instantiationService.createInstance(DroxAgentsChatStatusBar));
		this._statusBar = bar;
		this._host.appendChild(bar.domNode);
	}

	private _unmount(): void {
		this._statusBar = undefined;
		this._hostDisposables.clear();
		dom.clearNode(this._host);
		this._host.style.display = 'none';
	}
}

export function createDroxAgentsChatStatusBarHost(
	instantiationService: IInstantiationService,
	configurationService: IConfigurationService,
	parent: HTMLElement,
): DroxAgentsChatStatusBarHost | undefined {
	if (!isDroxNativeChatStackEnabled(configurationService)) {
		return undefined;
	}
	const element = dom.append(parent, dom.$('.drox-agents-chat-status-host'));
	element.style.display = 'none';
	return instantiationService.createInstance(DroxAgentsChatStatusBarHost, element);
}
