/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { registerSingleton, InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IDroxChatUiStatsSnapshot } from '../../common/droxChatUiStatsFormat.js';
import { droxConfigChangeAffectsArchitectSettings } from '../../common/droxChatConfigSync.js';
import { DroxSetting } from '../../common/droxConfiguration.js';
import { clampDroxNumCtx } from '../../common/droxNumCtx.js';
import { DROX_DEFAULT_NUM_CTX } from '../../common/droxProductDefaults.js';

export const IDroxAgentsChatUiStatsService = createDecorator<IDroxAgentsChatUiStatsService>('droxAgentsChatUiStatsService');

export interface IDroxAgentsChatUiStatsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly stats: IDroxChatUiStatsSnapshot;
	getNumCtx(): number;
	getCycleElapsedMs(): number;
	resetCycleTimer(): void;
	freezeCycleTimer(): void;
	clearCycleTimer(): void;
	trackUsage(inputTokens: number, outputTokens: number): void;
	trackContext(tokensUsed: number): void;
	handleAgentEvent(params: unknown): void;
}

function emptyStats(): IDroxChatUiStatsSnapshot {
	return { totalIn: 0, totalOut: 0, ctx: 0 };
}

export class DroxAgentsChatUiStatsService extends Disposable implements IDroxAgentsChatUiStatsService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _stats: IDroxChatUiStatsSnapshot = emptyStats();
	private _cycleStartedAt: number | undefined;
	private _cycleFrozenMs: number | undefined;
	private _cycleTimerId: ReturnType<typeof setInterval> | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (droxConfigChangeAffectsArchitectSettings(e)) {
				this._fireChange();
			}
		}));
	}

	get stats(): IDroxChatUiStatsSnapshot {
		return this._stats;
	}

	getNumCtx(): number {
		const raw = this.configurationService.getValue<number | undefined>(DroxSetting.NumCtx);
		return clampDroxNumCtx(typeof raw === 'number' && Number.isFinite(raw) ? raw : DROX_DEFAULT_NUM_CTX);
	}

	getCycleElapsedMs(): number {
		if (this._cycleFrozenMs != null) {
			return this._cycleFrozenMs;
		}
		if (this._cycleStartedAt != null) {
			return Date.now() - this._cycleStartedAt;
		}
		return 0;
	}

	resetCycleTimer(): void {
		this.clearCycleTimer();
		this._cycleStartedAt = Date.now();
		this._cycleFrozenMs = undefined;
		this._cycleTimerId = setInterval(() => this._fireChange(), 1000);
		this._fireChange();
	}

	freezeCycleTimer(): void {
		if (this._cycleStartedAt == null || this._cycleFrozenMs != null) {
			return;
		}
		this._cycleFrozenMs = Date.now() - this._cycleStartedAt;
		this._stopCycleInterval();
		this._fireChange();
	}

	clearCycleTimer(): void {
		this._stopCycleInterval();
		this._cycleStartedAt = undefined;
		this._cycleFrozenMs = undefined;
		this._fireChange();
	}

	trackUsage(inputTokens: number, outputTokens: number): void {
		let changed = false;
		if (inputTokens > 0) {
			this._stats = { ...this._stats, totalIn: this._stats.totalIn + inputTokens };
			changed = true;
		}
		if (outputTokens > 0) {
			this._stats = { ...this._stats, totalOut: this._stats.totalOut + outputTokens };
			changed = true;
		}
		if (inputTokens > 0) {
			this._stats = { ...this._stats, ctx: inputTokens };
			changed = true;
		}
		if (changed) {
			this._fireChange();
		}
	}

	trackContext(tokensUsed: number): void {
		if (tokensUsed <= 0) {
			return;
		}
		this._stats = { ...this._stats, ctx: tokensUsed };
		this._fireChange();
	}

	handleAgentEvent(params: unknown): void {
		const ev = (params as { event?: Record<string, unknown> } | undefined)?.event;
		if (!ev || typeof ev.kind !== 'string') {
			return;
		}
		switch (ev.kind) {
			case 'context_usage': {
				const tokens = Number(ev.parent_tokens ?? ev.parentTokens ?? 0);
				this.trackContext(tokens);
				return;
			}
			case 'context_snip': {
				const after = Number(ev.tokens_used_after ?? ev.tokensUsedAfter ?? 0);
				this.trackContext(after);
				return;
			}
			case 'turn_usage':
			case 'stop': {
				const usage = (ev.usage ?? {}) as Record<string, unknown>;
				const inputTokens = Number(usage.input_tokens ?? usage.inputTokens ?? 0);
				const outputTokens = Number(usage.output_tokens ?? usage.outputTokens ?? 0);
				this.trackUsage(inputTokens, outputTokens);
				return;
			}
			default:
				return;
		}
	}

	private _stopCycleInterval(): void {
		if (this._cycleTimerId != null) {
			clearInterval(this._cycleTimerId);
			this._cycleTimerId = undefined;
		}
	}

	private _fireChange(): void {
		this._onDidChange.fire();
	}

	override dispose(): void {
		this._stopCycleInterval();
		super.dispose();
	}
}

registerSingleton(IDroxAgentsChatUiStatsService, DroxAgentsChatUiStatsService, InstantiationType.Delayed);
