/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { DroxSetting } from '../droxConfiguration.js';
import {
	matchTrafficDestinationAlerts,
	matchTrafficDestinationTag,
	newTrafficAlertId,
	newTrafficTagId,
	parseTrafficDestinationAlerts,
	parseTrafficDestinationTags,
} from './droxTrafficTags.js';
import {
	DROX_TRAFFIC_LIVE_CAP,
	DroxTrafficKind,
	DroxTrafficMode,
	IDroxTrafficDestinationAlert,
	IDroxTrafficDestinationTag,
	IDroxTrafficEvent,
} from './droxTrafficTypes.js';

/** Min gap between toasts for the same alert rule (avoid spam on busy hosts). */
const ALERT_COOLDOWN_MS = 15_000;

export const IDroxTrafficService = createDecorator<IDroxTrafficService>('droxTrafficService');

export interface IDroxTrafficService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly enabled: boolean;
	readonly mode: DroxTrafficMode;
	readonly events: readonly IDroxTrafficEvent[];
	readonly destinationTags: readonly IDroxTrafficDestinationTag[];
	readonly destinationAlerts: readonly IDroxTrafficDestinationAlert[];
	/** Known on-disk folder for persisted capture. */
	getPersistDirFsPath(): string;
	setEnabled(enabled: boolean): Promise<void>;
	setMode(mode: DroxTrafficMode): Promise<void>;
	addDestinationTag(input: { label: string; color: string; match: string }): Promise<IDroxTrafficDestinationTag>;
	removeDestinationTag(id: string): Promise<void>;
	addDestinationAlert(input: { match: string; label?: string }): Promise<IDroxTrafficDestinationAlert>;
	removeDestinationAlert(id: string): Promise<void>;
	record(partial: Omit<IDroxTrafficEvent, 'id' | 'at' | 'tag'> & { id?: string; at?: number }): void;
	clear(): Promise<void>;
}

export class DroxTrafficService extends Disposable implements IDroxTrafficService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _events: IDroxTrafficEvent[] = [];
	private _seq = 0;
	private readonly _alertCooldown = new Map<string, number>();

	/** In-memory source of truth — config is persistence only. */
	private _tags: IDroxTrafficDestinationTag[] = [];
	private _alerts: IDroxTrafficDestinationAlert[] = [];
	/** Skip config→memory reload while we are writing rules ourselves. */
	private _writingRules = false;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super();
		this._reloadRulesFromConfig();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			let rulesChanged = false;
			if (!this._writingRules) {
				if (e.affectsConfiguration(DroxSetting.TrafficDestinationTags)) {
					this._tags = parseTrafficDestinationTags(
						this.configurationService.getValue(DroxSetting.TrafficDestinationTags),
					);
					rulesChanged = true;
				}
				if (e.affectsConfiguration(DroxSetting.TrafficDestinationAlerts)) {
					this._alerts = parseTrafficDestinationAlerts(
						this.configurationService.getValue(DroxSetting.TrafficDestinationAlerts),
					);
					rulesChanged = true;
				}
			}
			if (rulesChanged) {
				this._reapplyTagsToEvents();
			}
			if (
				rulesChanged
				|| e.affectsConfiguration(DroxSetting.TrafficEnabled)
				|| e.affectsConfiguration(DroxSetting.TrafficMode)
			) {
				this._onDidChange.fire();
			}
		}));
	}

	get enabled(): boolean {
		return this.configurationService.getValue<boolean>(DroxSetting.TrafficEnabled) === true;
	}

	get mode(): DroxTrafficMode {
		const raw = this.configurationService.getValue<string>(DroxSetting.TrafficMode);
		return raw === 'persisted' ? 'persisted' : 'live';
	}

	get events(): readonly IDroxTrafficEvent[] {
		return this._events;
	}

	get destinationTags(): readonly IDroxTrafficDestinationTag[] {
		return this._tags;
	}

	get destinationAlerts(): readonly IDroxTrafficDestinationAlert[] {
		return this._alerts;
	}

	getPersistDirFsPath(): string {
		return joinPath(URI.file(this.environmentService.userDataPath), 'drox-traffic').fsPath;
	}

	async setEnabled(enabled: boolean): Promise<void> {
		await this.configurationService.updateValue(DroxSetting.TrafficEnabled, enabled, ConfigurationTarget.USER);
		this._onDidChange.fire();
	}

	async setMode(mode: DroxTrafficMode): Promise<void> {
		await this.configurationService.updateValue(DroxSetting.TrafficMode, mode, ConfigurationTarget.USER);
		this._onDidChange.fire();
	}

	async addDestinationTag(input: { label: string; color: string; match: string }): Promise<IDroxTrafficDestinationTag> {
		const label = input.label.trim();
		const color = input.color.trim();
		const match = input.match.trim();
		if (!label || !color || !match) {
			throw new Error(localize('drox.traffic.tagIncomplete', 'Tag needs a label, a color and a destination match (host / IP / URL).'));
		}
		const tag: IDroxTrafficDestinationTag = {
			id: newTrafficTagId(),
			label,
			color,
			match,
		};
		this._tags = [...this._tags, tag];
		this._reapplyTagsToEvents();
		this._onDidChange.fire();
		await this._persistTags();
		return tag;
	}

	async removeDestinationTag(id: string): Promise<void> {
		this._tags = this._tags.filter(t => t.id !== id);
		this._reapplyTagsToEvents();
		this._onDidChange.fire();
		await this._persistTags();
	}

	async addDestinationAlert(input: { match: string; label?: string }): Promise<IDroxTrafficDestinationAlert> {
		const match = input.match.trim();
		const label = input.label?.trim();
		if (!match) {
			throw new Error(localize('drox.traffic.alertIncomplete', 'Alert needs a destination match (host / IP / URL).'));
		}
		const alert: IDroxTrafficDestinationAlert = label
			? { id: newTrafficAlertId(), match, label }
			: { id: newTrafficAlertId(), match };
		this._alerts = [...this._alerts, alert];
		this._onDidChange.fire();
		await this._persistAlerts();
		return alert;
	}

	async removeDestinationAlert(id: string): Promise<void> {
		this._alerts = this._alerts.filter(a => a.id !== id);
		this._alertCooldown.delete(id);
		this._onDidChange.fire();
		await this._persistAlerts();
	}

	record(partial: Omit<IDroxTrafficEvent, 'id' | 'at' | 'tag'> & { id?: string; at?: number }): void {
		if (!this.enabled) {
			return;
		}
		const destination = typeof partial.destination === 'string' && partial.destination.trim()
			? partial.destination.trim()
			: undefined;
		const tag = matchTrafficDestinationTag(destination, this._tags, partial.summary);
		const event: IDroxTrafficEvent = {
			id: partial.id ?? `t-${Date.now()}-${++this._seq}`,
			at: partial.at ?? Date.now(),
			direction: partial.direction,
			kind: partial.kind,
			summary: partial.summary,
			detail: partial.detail,
			durationMs: partial.durationMs,
			status: partial.status,
			destination,
			tag,
		};
		this._events = [event, ...this._events].slice(0, DROX_TRAFFIC_LIVE_CAP);
		this._fireAlerts(event);
		this._onDidChange.fire();
		if (this.mode === 'persisted') {
			void this._appendPersisted(event);
		}
	}

	async clear(): Promise<void> {
		this._events = [];
		this._onDidChange.fire();
		if (this.mode !== 'persisted') {
			return;
		}
		const dir = URI.file(this.getPersistDirFsPath());
		try {
			if (await this.fileService.exists(dir)) {
				await this.fileService.del(dir, { recursive: true, useTrash: false });
			}
		} catch (err) {
			this.logService.warn(`[drox-traffic] clear failed: ${err}`);
			throw new Error(localize('drox.traffic.clearFail', 'Could not clear persisted traffic: {0}', err instanceof Error ? err.message : String(err)));
		}
	}

	private _reloadRulesFromConfig(): void {
		this._tags = parseTrafficDestinationTags(
			this.configurationService.getValue(DroxSetting.TrafficDestinationTags),
		);
		this._alerts = parseTrafficDestinationAlerts(
			this.configurationService.getValue(DroxSetting.TrafficDestinationAlerts),
		);
	}

	private async _persistTags(): Promise<void> {
		this._writingRules = true;
		try {
			await this.configurationService.updateValue(
				DroxSetting.TrafficDestinationTags,
				this._tags.map(t => ({ id: t.id, label: t.label, color: t.color, match: t.match })),
				ConfigurationTarget.USER,
			);
		} catch (err) {
			this.logService.warn(`[drox-traffic] persist tags failed: ${err}`);
			throw err;
		} finally {
			this._writingRules = false;
		}
	}

	private async _persistAlerts(): Promise<void> {
		this._writingRules = true;
		try {
			await this.configurationService.updateValue(
				DroxSetting.TrafficDestinationAlerts,
				this._alerts.map(a => a.label
					? { id: a.id, match: a.match, label: a.label }
					: { id: a.id, match: a.match }),
				ConfigurationTarget.USER,
			);
		} catch (err) {
			this.logService.warn(`[drox-traffic] persist alerts failed: ${err}`);
			throw err;
		} finally {
			this._writingRules = false;
		}
	}

	private _fireAlerts(event: IDroxTrafficEvent): void {
		const hits = matchTrafficDestinationAlerts(event.destination, this._alerts, event.summary);
		if (!hits.length) {
			return;
		}
		const now = Date.now();
		for (const alert of hits) {
			const last = this._alertCooldown.get(alert.id) ?? 0;
			if (now - last < ALERT_COOLDOWN_MS) {
				continue;
			}
			this._alertCooldown.set(alert.id, now);
			const name = alert.label?.trim() || alert.match;
			this.notificationService.notify({
				severity: Severity.Warning,
				message: localize(
					'drox.traffic.alertToast',
					'Traffic alert · {0}: {1}',
					name,
					event.summary,
				),
			});
		}
	}

	private _reapplyTagsToEvents(): void {
		const tags = this._tags;
		this._events = this._events.map(ev => ({
			...ev,
			tag: matchTrafficDestinationTag(ev.destination, tags, ev.summary),
		}));
	}

	private async _appendPersisted(event: IDroxTrafficEvent): Promise<void> {
		try {
			const dir = URI.file(this.getPersistDirFsPath());
			await this.fileService.createFolder(dir);
			const day = new Date(event.at).toISOString().slice(0, 10);
			const file = joinPath(dir, `traffic-${day}.jsonl`);
			const line = `${JSON.stringify(event)}\n`;
			if (await this.fileService.exists(file)) {
				const existing = await this.fileService.readFile(file);
				await this.fileService.writeFile(file, VSBuffer.concat([existing.value, VSBuffer.fromString(line)]));
			} else {
				await this.fileService.writeFile(file, VSBuffer.fromString(line));
			}
		} catch (err) {
			this.logService.trace(`[drox-traffic] persist skip: ${err}`);
		}
	}
}

export function droxTrafficKindLabel(kind: DroxTrafficKind): string {
	switch (kind) {
		case 'llm': return 'LLM';
		case 'embed': return 'Embed';
		case 'mcp': return 'MCP';
		case 'tool': return 'Tool';
		case 'rpc': return 'RPC';
		default: return 'Other';
	}
}
