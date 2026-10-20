/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { FileChangeType, IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IDroxChatSessionService } from '../common/droxChatSessionService.js';
import { isBareDroxExecutableName } from '../common/droxExecutable.js';
import { IDroxExecutableService } from '../common/droxExecutableService.js';
import { DroxEngineDisposeReason } from '../common/droxEngineLifecycle.js';
import { DroxEngineInitializeResult, IDroxEngineService } from '../common/droxEngineService.js';
import { DROX_ENGINE_RESPAWN_SETTINGS } from '../common/droxRunSettings.js';

class DroxEngineConfigContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxEngineConfig';

	private readonly respawnScheduler = this._register(new RunOnceScheduler(() => {
		void this.requestRespawn(
			'respawn-binary',
			localize(
				'drox.engineRespawnBinary',
				'Drox engine binary was rebuilt. Restarting the engine.',
			),
		);
	}, 1500));

	private executableWatchUri: URI | undefined;
	private pendingRespawnMessage: string | undefined;
	private pendingRespawnReason: DroxEngineDisposeReason | undefined;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IDroxEngineService private readonly droxEngineService: IDroxEngineService,
		@IDroxExecutableService private readonly executableService: IDroxExecutableService,
		@IFileService private readonly fileService: IFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDroxChatSessionService private readonly chatSessionService: IDroxChatSessionService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (!this.droxEngineService.isStarted) {
				return;
			}
			const needsRespawn = DROX_ENGINE_RESPAWN_SETTINGS.some(key => e.affectsConfiguration(key));
			if (!needsRespawn) {
				return;
			}
			void this.requestRespawn(
				'respawn-settings',
				localize(
					'drox.engineRespawn',
					'Drox engine settings changed. Restarting the engine for the new configuration to take effect.',
				),
			);
		}));

		this._register(this.chatSessionService.onDidChangeRunId(() => {
			void this.flushPendingRespawn();
		}));

		this._register(this.droxEngineService.onNotification(e => {
			if (e.method === 'agent/done') {
				void this.flushPendingRespawn();
			}
		}));

		this._register(this.droxEngineService.onDidInitialize(init => {
			this.warnLegacyEngine(init);
			void this.watchExecutableForRebuild();
		}));
	}

	private isEngineBusy(): boolean {
		return !!this.chatSessionService.getRunId() || this.droxEngineService.isAgentRunActive;
	}

	private warnLegacyEngine(init: DroxEngineInitializeResult): void {
		const pipeline = typeof init?.orchestrationPipeline === 'string' ? init.orchestrationPipeline : '';
		if (pipeline === 'role_split' || pipeline === 'tui_mono') {
			return;
		}
		this.notificationService.notify({
			severity: Severity.Warning,
			message: localize(
				'drox.legacyEngine',
				'Legacy Drox engine detected (pipeline: {0}). Run `cargo build -p drox-cli` in drox-engine/drox, then Reload Window. Check Output → Drox (moteur).',
				pipeline || '?',
			),
		});
	}

	private async watchExecutableForRebuild(): Promise<void> {
		const executable = await this.executableService.resolve();
		const trimmed = executable.trim();
		if (!trimmed || isBareDroxExecutableName(trimmed)) {
			return;
		}
		if (!(await this.fileService.exists(URI.file(trimmed)))) {
			return;
		}
		const uri = URI.file(trimmed);
		if (this.executableWatchUri?.toString() === uri.toString()) {
			return;
		}
		this.executableWatchUri = uri;
		this._register(this.fileService.watch(uri));
		this._register(this.fileService.onDidFilesChange(e => {
			if (!this.droxEngineService.isStarted) {
				return;
			}
			if (e.contains(uri, FileChangeType.UPDATED, FileChangeType.ADDED)) {
				this.respawnScheduler.schedule();
			}
		}));
	}

	private async requestRespawn(reason: DroxEngineDisposeReason, message: string): Promise<void> {
		if (this.isEngineBusy()) {
			this.pendingRespawnMessage = message;
			this.pendingRespawnReason = reason;
			this.logService.info(`[Drox] engine respawn deferred reason=${reason} (agent run active)`);
			this.notificationService.info(localize(
				'drox.engineRespawnDeferred',
				'Engine settings will apply after the current agent run finishes.',
			));
			return;
		}
		await this.respawnEngine(reason, message);
	}

	private async flushPendingRespawn(): Promise<void> {
		if (this.isEngineBusy() || !this.pendingRespawnMessage || !this.pendingRespawnReason) {
			return;
		}
		const message = this.pendingRespawnMessage;
		const reason = this.pendingRespawnReason;
		this.pendingRespawnMessage = undefined;
		this.pendingRespawnReason = undefined;
		await this.respawnEngine(reason, message);
	}

	private async respawnEngine(reason: DroxEngineDisposeReason, message: string): Promise<void> {
		if (this.isEngineBusy()) {
			this.pendingRespawnMessage = message;
			this.pendingRespawnReason = reason;
			this.logService.info(`[Drox] engine respawn re-deferred reason=${reason}`);
			return;
		}
		this.notificationService.info(message);
		this.logService.info(`[Drox] engine respawn now reason=${reason}`);
		await this.droxEngineService.dispose(reason);
	}

}

registerWorkbenchContribution2(
	DroxEngineConfigContribution.ID,
	DroxEngineConfigContribution,
	WorkbenchPhase.Eventually,
);
