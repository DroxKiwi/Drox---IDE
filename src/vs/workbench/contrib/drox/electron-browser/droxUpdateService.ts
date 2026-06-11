/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isWindows } from '../../../../base/common/platform.js';
import * as semver from '../../../../base/common/semver/semver.js';
import { URI } from '../../../../base/common/uri.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Severity, INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { asTextOrError, IRequestService } from '../../../../platform/request/common/request.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { DROX_DEFAULT_UPDATE_MANIFEST_URL, DroxSetting } from '../common/droxConfiguration.js';
import { isDroxDevFeatureEnabled } from '../common/droxDevSurface.js';
import { IDroxUpdateCheckOptions, IDroxUpdateCheckResult, IDroxUpdateService } from '../common/droxUpdateService.js';

interface IDroxPlatformRelease {
	readonly installerUrl?: string;
	readonly installerURL?: string;
	readonly installer_url?: string;
	readonly downloadUrl?: string;
	readonly downloadURL?: string;
	readonly url?: string;
	readonly sha256?: string;
}

interface IDroxLatestManifest {
	readonly version?: string;
	readonly installerUrl?: string;
	readonly installerURL?: string;
	readonly installer_url?: string;
	readonly downloadUrl?: string;
	readonly downloadURL?: string;
	readonly url?: string;
	readonly notesUrl?: string;
	readonly notesURL?: string;
	readonly notes_url?: string;
	readonly releaseNotesUrl?: string;
	readonly releaseNotesURL?: string;
	readonly platforms?: Record<string, IDroxPlatformRelease | undefined>;
	readonly assets?: {
		readonly windows?: {
			readonly installerUrl?: string;
			readonly installerURL?: string;
			readonly url?: string;
			readonly downloadUrl?: string;
		};
	};
}

export class DroxUpdateService extends Disposable implements IDroxUpdateService {

	declare readonly _serviceBrand: undefined;

	private dismissedVersionInSession: string | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRequestService private readonly requestService: IRequestService,
		@IProductService private readonly productService: IProductService,
		@INotificationService private readonly notificationService: INotificationService,
		@IOpenerService private readonly openerService: IOpenerService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	async checkForUpdates(options: IDroxUpdateCheckOptions = {}): Promise<IDroxUpdateCheckResult> {
		const current = (this.productService.droxVersion ?? this.productService.version ?? '').trim();
		if (!current) {
			return { kind: 'skipped', message: 'No product version (droxVersion).' };
		}

		const simulatedRaw = this.configurationService.getValue<string>(DroxSetting.UpdateSimulateLatestVersion)?.trim();
		const simulated = isDroxDevFeatureEnabled('updateSimulateLatest', this.productService) ? simulatedRaw : '';
		if (simulated) {
			const simulateInstaller = this.configurationService.getValue<string>(DroxSetting.UpdateSimulateInstallerUrl)?.trim()
				|| 'https://github.com/DroxKiwi/Drox---IDE---OR/releases/latest';
			return this.evaluateVersions(current, simulated, {
				installerUrl: simulateInstaller,
				notesUrl: simulateInstaller,
			}, options, true);
		}

		const manifestUrl = this.resolveManifestUrl();
		this.logService.debug(`[Drox] update check: current=${current} manifest=${manifestUrl}`);

		try {
			const context = await this.requestService.request(
				{ type: 'GET', url: manifestUrl, disableCache: true, timeout: 15000, callSite: 'droxUpdateService' },
				CancellationToken.None,
			);
			const raw = await asTextOrError(context);
			if (!raw) {
				const msg = localize('drox.update.emptyManifest', 'Update manifest returned no content.');
				if (options.notifyIfUpToDate) {
					this.notificationService.warn(msg);
				}
				return { kind: 'error', currentVersion: current, message: msg };
			}
			const parsed = JSON.parse(raw) as IDroxLatestManifest;
			const latest = typeof parsed.version === 'string' ? parsed.version.trim() : '';
			if (!latest) {
				const msg = localize('drox.update.noVersionInManifest', 'Update manifest has no version field.');
				if (options.notifyIfUpToDate) {
					this.notificationService.warn(msg);
				}
				return { kind: 'error', currentVersion: current, message: msg };
			}
			this.logService.debug(`[Drox] update manifest: latest=${latest}`);
			return this.evaluateVersions(current, latest, parsed, options, false);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			this.logService.warn(`[Drox] update check failed: ${msg}`);
			if (options.notifyIfUpToDate) {
				this.notificationService.warn(
					localize('drox.update.checkFailed', 'Update check failed: {0}', msg),
				);
			}
			return { kind: 'error', currentVersion: current, message: msg };
		}
	}

	private resolveManifestUrl(): string {
		const configured = this.configurationService.getValue<string>(DroxSetting.UpdateManifestUrl);
		const trimmed = typeof configured === 'string' ? configured.trim() : '';
		return trimmed.length > 0 ? trimmed : DROX_DEFAULT_UPDATE_MANIFEST_URL;
	}

	private pickPlatformRelease(manifest: IDroxLatestManifest): IDroxPlatformRelease | undefined {
		const platforms = manifest.platforms;
		if (!platforms) {
			return undefined;
		}
		if (isWindows) {
			return platforms['win32-x64'] ?? platforms['win32'];
		}
		return platforms['darwin-arm64'] ?? platforms['darwin-x64'] ?? platforms['linux-x64'];
	}

	private evaluateVersions(
		current: string,
		latest: string,
		manifest: IDroxLatestManifest,
		options: IDroxUpdateCheckOptions,
		simulated: boolean,
	): IDroxUpdateCheckResult {
		if (!options.ignoreDismissed && this.dismissedVersionInSession === latest) {
			if (options.notifyIfUpToDate) {
				this.notificationService.info(
					localize(
						'drox.update.dismissedThisSession',
						'Update {0} was dismissed for this session. Restart the app to be prompted again.',
						latest,
					),
				);
			}
			return { kind: 'skipped', currentVersion: current, latestVersion: latest, message: 'dismissed' };
		}

		const latestSemver = semver.coerce(latest);
		const currentSemver = semver.coerce(current);
		if (!latestSemver || !currentSemver) {
			const msg = localize(
				'drox.update.invalidSemver',
				'Cannot compare versions (current: {0}, latest: {1}).',
				current,
				latest,
			);
			if (options.notifyIfUpToDate) {
				this.notificationService.warn(msg);
			}
			return { kind: 'error', currentVersion: current, latestVersion: latest, message: msg };
		}

		if (!semver.gt(latestSemver, currentSemver)) {
			if (options.notifyIfUpToDate) {
				this.notificationService.info(
					simulated
						? localize(
							'drox.update.simulateNotNewer',
							'Simulated version {0} is not newer than current {1}. Use a higher value in drox.update.simulateLatestVersion.',
							latest,
							current,
						)
						: localize(
							'drox.update.upToDate',
							'Drox is up to date ({0}). Remote manifest: {1}.',
							current,
							latest,
						),
				);
			}
			return { kind: 'up_to_date', currentVersion: current, latestVersion: latest };
		}

		this.showUpdatePrompt(manifest, current, latest);
		return { kind: 'update_available', currentVersion: current, latestVersion: latest };
	}

	private showUpdatePrompt(manifest: IDroxLatestManifest, currentVersion: string, latestVersion: string): void {
		const platform = this.pickPlatformRelease(manifest);
		const installerUrl = this.pickUrl(
			platform?.installerUrl,
			platform?.installerURL,
			platform?.installer_url,
			platform?.downloadUrl,
			platform?.downloadURL,
			platform?.url,
			manifest.installerUrl,
			manifest.installerURL,
			manifest.installer_url,
			manifest.downloadUrl,
			manifest.downloadURL,
			manifest.assets?.windows?.installerUrl,
			manifest.assets?.windows?.installerURL,
			manifest.assets?.windows?.downloadUrl,
			manifest.assets?.windows?.url,
			manifest.url,
		);
		const notesUrl = this.pickUrl(
			manifest.notesUrl,
			manifest.notesURL,
			manifest.notes_url,
			manifest.releaseNotesUrl,
			manifest.releaseNotesURL,
		);
		this.notificationService.prompt(
			Severity.Info,
			localize(
				'drox.update.available',
				'Update available: Drox {0} (current: {1}).',
				latestVersion,
				currentVersion,
			),
			[
				{
					label: localize('drox.update.installNow', 'Installer maintenant'),
					run: () => {
						const target = installerUrl || notesUrl;
						if (!target) {
							this.notificationService.warn(
								localize('drox.update.noLink', 'No installer link found in the update manifest.'),
							);
							return;
						}
						void this.openerService.open(URI.parse(target), { openExternal: true, allowTunneling: false });
					},
				},
				{
					label: localize('drox.update.later', 'Plus tard'),
					run: () => {
						this.dismissedVersionInSession = latestVersion;
					},
				},
			],
			{
				sticky: true,
				onCancel: () => {
					this.dismissedVersionInSession = latestVersion;
				},
			},
		);
	}

	private pickUrl(...values: Array<string | undefined>): string {
		for (const value of values) {
			if (typeof value === 'string') {
				const trimmed = value.trim();
				if (trimmed.length > 0) {
					return trimmed;
				}
			}
		}
		return '';
	}
}

registerSingleton(IDroxUpdateService, DroxUpdateService, InstantiationType.Delayed);
