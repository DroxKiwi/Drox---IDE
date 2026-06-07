/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { FocusMode } from '../../../../platform/native/common/native.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { DroxSetting } from './droxConfiguration.js';

export function isDroxCycleDoneNotificationEnabled(configService: IConfigurationService): boolean {
	return configService.getValue<boolean>(DroxSetting.CycleDoneWindowsNotification) !== false;
}

export function isDroxCycleDoneNotifyWhenFocused(configService: IConfigurationService): boolean {
	return configService.getValue<boolean>(DroxSetting.CycleDoneWhenFocused) === true;
}

export interface IDroxCycleDoneNotificationLabels {
	readonly title: string;
	readonly body: string;
}

export function buildDroxCycleDoneNotificationLabels(
	runLabel: string,
	status: string | undefined,
	error: string | undefined,
): IDroxCycleDoneNotificationLabels {
	const title = status === 'error'
		? localize('drox.cycle.failed.title', 'Cycle arrêté')
		: localize('drox.cycle.done.title', 'Cycle terminé');
	const body = status === 'error'
		? localize(
			'drox.cycle.failed.body',
			'{0} s\'est arrêté ({1}).',
			runLabel,
			error && error.trim().length > 0 ? error.trim() : localize('drox.cycle.failed.generic', 'erreur'),
		)
		: localize('drox.cycle.done.body', '{0} est terminé.', runLabel);
	return { title, body };
}

export async function notifyDroxCycleDone(
	deps: {
		readonly configurationService: IConfigurationService;
		readonly notificationService: INotificationService;
		readonly hostService: IHostService;
		readonly logService: ILogService;
	},
	labels: IDroxCycleDoneNotificationLabels,
	context: { readonly runLabel: string; readonly status?: string },
): Promise<void> {
	if (!isDroxCycleDoneNotificationEnabled(deps.configurationService)) {
		deps.logService.info('[Drox] cycle done: skipped (drox.notifications.cycleDone.windows=false)');
		return;
	}

	const documentFocused = deps.hostService.hasFocus;
	const windowHadFocus = await deps.hostService.hadLastFocus();
	const windowActive = documentFocused && windowHadFocus;
	const notifyWhenFocused = isDroxCycleDoneNotifyWhenFocused(deps.configurationService);

	if (windowActive && !notifyWhenFocused) {
		deps.logService.info(
			`[Drox] cycle done: skipped (window focused) status=${context.status ?? 'unknown'} label=${context.runLabel}`,
		);
		return;
	}

	const showWorkbench = !windowActive || notifyWhenFocused;
	const showOsToast = !windowActive;

	deps.logService.info(
		`[Drox] cycle done: notify workbench=${showWorkbench} toast=${showOsToast} focused=${windowActive} status=${context.status ?? 'unknown'} label=${context.runLabel}`,
	);

	if (showWorkbench) {
		deps.notificationService.notify({
			severity: statusSeverity(context.status),
			message: `${labels.title} — ${labels.body}`,
		});
	}

	if (!showOsToast) {
		return;
	}

	await deps.hostService.focus(mainWindow, { mode: FocusMode.Notify }).catch(() => undefined);

	const showWorkbenchFallback = () => {
		deps.logService.warn('[Drox] cycle toast: using workbench notification (OS toast unavailable or failed)');
		deps.notificationService.notify({
			severity: statusSeverity(context.status),
			message: `${labels.title} — ${labels.body}`,
		});
	};

	try {
		const result = await deps.hostService.showToast(
			{ title: labels.title, body: labels.body },
			CancellationToken.None,
		);
		if (!result.supported) {
			if (!showWorkbench) {
				showWorkbenchFallback();
			}
			return;
		}
		if (result.clicked) {
			await deps.hostService.focus(mainWindow, { mode: FocusMode.Force });
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		deps.logService.warn(`[Drox] cycle toast failed: ${msg}`);
		if (!showWorkbench) {
			showWorkbenchFallback();
		}
	}
}

function statusSeverity(status: string | undefined): Severity {
	return status === 'error' ? Severity.Warning : Severity.Info;
}
