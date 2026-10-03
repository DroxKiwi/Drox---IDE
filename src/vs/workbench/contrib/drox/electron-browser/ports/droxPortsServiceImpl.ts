/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { DroxSetting } from '../../common/droxConfiguration.js';
import {
	DROX_ENGINE_CHANNEL_NAME,
	DroxEngineCommand,
	IDroxPortForwardProbeResult,
	IDroxPortForwardStartResult,
} from '../../common/droxIpc.js';
import {
	droxPortsOpenUrl,
	newDroxPortsForwardId,
	newDroxPortsToolId,
	parseDroxPortsForwards,
	parseDroxPortsTools,
	resolveDroxPortsLaunch,
	serializeDroxPortsForward,
	serializeDroxPortsTool,
} from '../../common/ports/droxPortsConfig.js';
import { IDroxPortsService } from '../../common/ports/droxPortsService.js';
import {
	IDroxPortsForward,
	IDroxPortsRuntimeState,
	IDroxPortsTool,
} from '../../common/ports/droxPortsTypes.js';

const PROBE_ATTEMPTS = 20;
const PROBE_GAP_MS = 400;

export class DroxPortsService extends Disposable implements IDroxPortsService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _tools: IDroxPortsTool[] = [];
	private _forwards: IDroxPortsForward[] = [];
	private _defaultToolId: string | undefined;
	private _writing = false;
	private readonly _runtime = new Map<string, IDroxPortsRuntimeState>();
	private readonly _channel;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IMainProcessService mainProcessService: IMainProcessService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IOpenerService private readonly openerService: IOpenerService,
		@INotificationService private readonly notificationService: INotificationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this._channel = mainProcessService.getChannel(DROX_ENGINE_CHANNEL_NAME);
		this._reloadFromConfig();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (this._writing) {
				return;
			}
			if (
				e.affectsConfiguration(DroxSetting.PortsTools)
				|| e.affectsConfiguration(DroxSetting.PortsForwards)
				|| e.affectsConfiguration(DroxSetting.PortsDefaultToolId)
			) {
				this._reloadFromConfig();
				this._onDidChange.fire();
			}
		}));
	}

	get tools(): readonly IDroxPortsTool[] {
		return this._tools;
	}

	get defaultToolId(): string | undefined {
		return this._defaultToolId;
	}

	get forwards(): readonly IDroxPortsForward[] {
		return this._forwards;
	}

	getRuntime(forwardId: string): IDroxPortsRuntimeState | undefined {
		return this._runtime.get(forwardId);
	}

	async setDefaultToolId(id: string | undefined): Promise<void> {
		this._defaultToolId = id?.trim() || undefined;
		this._onDidChange.fire();
		await this._persistDefaultToolId();
	}

	async addTool(input: Omit<IDroxPortsTool, 'id'> & { id?: string }): Promise<IDroxPortsTool> {
		const command = input.command.trim();
		const label = input.label.trim() || command;
		if (!command) {
			throw new Error(localize('drox.ports.toolIncomplete', 'Tool needs a command.'));
		}
		const tool: IDroxPortsTool = {
			id: input.id?.trim() || newDroxPortsToolId(),
			label,
			command,
			args: [...input.args],
			env: input.env,
			cwd: input.cwd?.trim() || undefined,
		};
		this._tools = [...this._tools, tool];
		if (!this._defaultToolId) {
			this._defaultToolId = tool.id;
		}
		this._onDidChange.fire();
		await this._persistTools();
		await this._persistDefaultToolId();
		return tool;
	}

	async removeTool(id: string): Promise<void> {
		this._tools = this._tools.filter(t => t.id !== id);
		if (this._defaultToolId === id) {
			this._defaultToolId = this._tools[0]?.id;
		}
		this._onDidChange.fire();
		await this._persistTools();
		await this._persistDefaultToolId();
	}

	async addForward(input: Omit<IDroxPortsForward, 'id' | 'localHost' | 'localPort' | 'protocol' | 'onReady'> & {
		id?: string;
		localHost?: string;
		localPort?: number;
		protocol?: IDroxPortsForward['protocol'];
		onReady?: IDroxPortsForward['onReady'];
		toolId?: string;
	}): Promise<IDroxPortsForward> {
		const remoteHost = input.remoteHost.trim() || '127.0.0.1';
		const remotePort = input.remotePort;
		if (!Number.isInteger(remotePort) || remotePort <= 0 || remotePort > 65535) {
			throw new Error(localize('drox.ports.forwardPortInvalid', 'Remote port must be between 1 and 65535.'));
		}
		const localPort = input.localPort ?? remotePort;
		const forward: IDroxPortsForward = {
			id: input.id?.trim() || newDroxPortsForwardId(),
			label: input.label.trim() || `${remoteHost}:${remotePort}`,
			remoteHost,
			remotePort,
			localHost: (input.localHost?.trim() || '127.0.0.1'),
			localPort,
			protocol: input.protocol ?? 'http',
			onReady: input.onReady ?? 'preview',
			toolId: input.toolId?.trim() || undefined,
		};
		this._forwards = [...this._forwards, forward];
		this._onDidChange.fire();
		await this._persistForwards();
		return forward;
	}

	async removeForward(id: string): Promise<void> {
		await this.stopForward(id).catch(() => { /* ignore */ });
		this._forwards = this._forwards.filter(f => f.id !== id);
		this._runtime.delete(id);
		this._onDidChange.fire();
		await this._persistForwards();
	}

	async startForward(id: string): Promise<void> {
		const forward = this._forwards.find(f => f.id === id);
		if (!forward) {
			throw new Error(localize('drox.ports.forwardMissing', 'Forward not found.'));
		}
		const toolId = forward.toolId || this._defaultToolId;
		const tool = this._tools.find(t => t.id === toolId);
		if (!tool) {
			throw new Error(localize(
				'drox.ports.toolMissing',
				'No external tool configured. Add a tool (e.g. ssh) in the Ports panel first.',
			));
		}

		const launch = resolveDroxPortsLaunch(forward, tool);
		this._setRuntime({ forwardId: id, status: 'starting' });
		const windowId = this.environmentService.window.id;

		const start = await this._channel.call<IDroxPortForwardStartResult>(DroxEngineCommand.PortForwardStart, {
			windowId,
			forwardId: id,
			command: launch.command,
			args: launch.args,
			env: launch.env,
			cwd: launch.cwd,
		});
		if (!start.ok) {
			this._setRuntime({ forwardId: id, status: 'error', error: start.error || 'start failed' });
			throw new Error(start.error || localize('drox.ports.startFailed', 'Failed to start forward tool.'));
		}

		for (let i = 0; i < PROBE_ATTEMPTS; i++) {
			const probe = await this._channel.call<IDroxPortForwardProbeResult>(DroxEngineCommand.PortForwardProbe, {
				host: launch.localHost,
				port: launch.localPort,
				timeoutMs: 600,
			});
			if (probe.ok) {
				this._setRuntime({
					forwardId: id,
					status: 'up',
					pid: start.pid,
					startedAt: Date.now(),
				});
				await this._handleOnReady(forward);
				return;
			}
			await new Promise(r => setTimeout(r, PROBE_GAP_MS));
		}

		// Tool may still be useful even if probe fails (non-TCP / delayed bind).
		this._setRuntime({
			forwardId: id,
			status: 'up',
			pid: start.pid,
			startedAt: Date.now(),
			error: localize('drox.ports.probeTimeout', 'Tool started; local port not confirmed yet.'),
		});
		this.notificationService.notify({
			severity: Severity.Info,
			message: localize(
				'drox.ports.probeTimeoutToast',
				'Forward “{0}” started, but {1}:{2} is not accepting connections yet.',
				forward.label,
				launch.localHost,
				String(launch.localPort),
			),
		});
	}

	async stopForward(id: string): Promise<void> {
		const cur = this._runtime.get(id);
		if (cur?.status === 'idle' || !cur) {
			this._setRuntime({ forwardId: id, status: 'idle' });
			return;
		}
		this._setRuntime({ forwardId: id, status: 'stopping' });
		const windowId = this.environmentService.window.id;
		try {
			await this._channel.call(DroxEngineCommand.PortForwardStop, { windowId, forwardId: id });
		} catch (err) {
			this.logService.warn(`[drox-ports] stop failed: ${err}`);
		}
		this._setRuntime({ forwardId: id, status: 'idle' });
	}

	async openForward(id: string): Promise<void> {
		const forward = this._forwards.find(f => f.id === id);
		if (!forward) {
			throw new Error(localize('drox.ports.forwardMissing', 'Forward not found.'));
		}
		const url = droxPortsOpenUrl(forward);
		if (!url) {
			this.notificationService.info(localize(
				'drox.ports.tcpNoOpen',
				'TCP forward “{0}” has no HTTP URL — connect to {1}:{2} with your client.',
				forward.label,
				forward.localHost,
				String(forward.localPort),
			));
			return;
		}
		await this.openerService.open(URI.parse(url), { openExternal: forward.onReady === 'browser' });
	}

	private async _handleOnReady(forward: IDroxPortsForward): Promise<void> {
		if (forward.onReady === 'none') {
			return;
		}
		if (forward.onReady === 'notify') {
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize(
					'drox.ports.readyToast',
					'Forward ready · {0} → {1}:{2}',
					forward.label,
					forward.localHost,
					String(forward.localPort),
				),
			});
			return;
		}
		const url = droxPortsOpenUrl(forward);
		if (!url) {
			return;
		}
		await this.openerService.open(URI.parse(url), {
			openExternal: forward.onReady === 'browser',
		});
	}

	private _setRuntime(state: IDroxPortsRuntimeState): void {
		this._runtime.set(state.forwardId, state);
		this._onDidChange.fire();
	}

	private _reloadFromConfig(): void {
		this._tools = parseDroxPortsTools(this.configurationService.getValue(DroxSetting.PortsTools));
		this._forwards = parseDroxPortsForwards(this.configurationService.getValue(DroxSetting.PortsForwards));
		const def = this.configurationService.getValue<string>(DroxSetting.PortsDefaultToolId);
		this._defaultToolId = typeof def === 'string' && def.trim() ? def.trim() : this._tools[0]?.id;
	}

	private _forwardsTarget(): ConfigurationTarget {
		return this.workspaceService.getWorkspace().folders.length > 0
			? ConfigurationTarget.WORKSPACE
			: ConfigurationTarget.USER;
	}

	private async _persistTools(): Promise<void> {
		this._writing = true;
		try {
			await this.configurationService.updateValue(
				DroxSetting.PortsTools,
				this._tools.map(serializeDroxPortsTool),
				ConfigurationTarget.USER,
			);
		} finally {
			this._writing = false;
		}
	}

	private async _persistDefaultToolId(): Promise<void> {
		this._writing = true;
		try {
			await this.configurationService.updateValue(
				DroxSetting.PortsDefaultToolId,
				this._defaultToolId ?? '',
				ConfigurationTarget.USER,
			);
		} finally {
			this._writing = false;
		}
	}

	private async _persistForwards(): Promise<void> {
		this._writing = true;
		try {
			await this.configurationService.updateValue(
				DroxSetting.PortsForwards,
				this._forwards.map(serializeDroxPortsForward),
				this._forwardsTarget(),
			);
		} finally {
			this._writing = false;
		}
	}
}
