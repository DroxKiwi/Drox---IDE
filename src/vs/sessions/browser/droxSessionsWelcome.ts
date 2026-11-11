/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Dialog, DialogContentsAlignment } from '../../base/browser/ui/dialog/dialog.js';
import { Codicon } from '../../base/common/codicons.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { localize } from '../../nls.js';
import { IContextKeyService } from '../../platform/contextkey/common/contextkey.js';
import { IHostService } from '../../workbench/services/host/browser/host.js';
import { IKeybindingService } from '../../platform/keybinding/common/keybinding.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../platform/storage/common/storage.js';
import { IWorkbenchLayoutService } from '../../workbench/services/layout/browser/layoutService.js';
import { createWorkbenchDialogOptions } from '../../workbench/browser/parts/dialogs/dialog.js';
// eslint-disable-next-line local/code-import-patterns -- Drox agents window welcome
import { appendDroxActivityGrid } from '../../workbench/contrib/drox/browser/droxActivityGrid.js';
// eslint-disable-next-line local/code-import-patterns -- Drox agents window welcome
import { shouldSkipDroxSessionsSignIn } from '../../workbench/contrib/drox/common/droxAgentsConfiguration.js';
import { SessionsWelcomeVisibleContext } from '../common/contextkeys.js';
import { WELCOME_COMPLETE_KEY } from '../common/welcome.js';

export interface IDroxSessionsWelcomeHost {
	readonly dialogRef: MutableDisposable<DisposableStore>;
	readonly logService: ILogService;
	readonly contextKeyService: IContextKeyService;
	readonly productService: IProductService;
	readonly storageService: IStorageService;
	readonly layoutService: IWorkbenchLayoutService;
	readonly keybindingService: IKeybindingService;
	readonly hostService: IHostService;
	markDone(): void;
	onCompleted(): void;
}

function completeDroxSessionsSetupWithoutAuth(host: IDroxSessionsWelcomeHost): void {
	host.storageService.store(WELCOME_COMPLETE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
	host.markDone();
	host.onCompleted();
}

/** First-launch Drox agents window. Returns true when the Microsoft sign-in path must not run. */
export function beginDroxSessionsWelcome(host: IDroxSessionsWelcomeHost): boolean {
	if (!shouldSkipDroxSessionsSignIn(host.productService)) {
		return false;
	}

	host.logService.info('[sessions welcome] Drox agents window');
	const isFirstLaunch = !host.storageService.getBoolean(WELCOME_COMPLETE_KEY, StorageScope.APPLICATION, false);
	if (isFirstLaunch) {
		void showDroxSessionsWelcomeDialog(host);
	} else {
		completeDroxSessionsSetupWithoutAuth(host);
	}
	return true;
}

/** Sign-in and the generic welcome are skipped. Returns true when setup was finished here. */
export function completeDroxSessionsSetupWhenSignInSkipped(host: IDroxSessionsWelcomeHost): boolean {
	if (!shouldSkipDroxSessionsSignIn(host.productService)) {
		return false;
	}
	completeDroxSessionsSetupWithoutAuth(host);
	return true;
}

/** Returns true when the activity grid replaced the Microsoft loading icon. */
export function appendDroxSessionsLoadingContent(overlay: HTMLElement, productService: IProductService): boolean {
	if (!shouldSkipDroxSessionsSignIn(productService)) {
		return false;
	}
	appendDroxActivityGrid(overlay, 'activity-grid activity-grid-inline sessions-loading-grid');
	return true;
}

async function showDroxSessionsWelcomeDialog(host: IDroxSessionsWelcomeHost): Promise<void> {
	if (host.dialogRef.value) {
		return;
	}

	host.logService.info('[sessions welcome] Showing Drox welcome dialog');

	const disposables = new DisposableStore();
	host.dialogRef.value = disposables;

	const welcomeVisibleKey = SessionsWelcomeVisibleContext.bindTo(host.contextKeyService);
	welcomeVisibleKey.set(true);
	disposables.add(toDisposable(() => welcomeVisibleKey.reset()));

	const productName = host.productService.nameLong || 'Drox';
	const dialog = disposables.add(new Dialog(
		host.layoutService.activeContainer,
		localize('sessions.droxWelcome.title', "Welcome to {0} Agents", productName),
		[localize('sessions.droxWelcome.getStarted', "Get Started")],
		createWorkbenchDialogOptions({
			type: 'none',
			extraClasses: ['chat-setup-dialog', 'sessions-welcome-dialog', 'sessions-main-welcome-dialog', 'sessions-drox-welcome-dialog'],
			detail: localize(
				'sessions.droxWelcome.detail',
				"Local agent powered by drox.exe. Open a workspace folder, choose a model in Drox Settings, and start building — no GitHub account required.",
			),
			icon: Codicon.sparkle,
			alignment: DialogContentsAlignment.Vertical,
			cancelId: 1,
			disableCloseButton: true,
		}, host.keybindingService, host.layoutService, host.hostService)
	));

	await dialog.show();
	disposables.dispose();
	host.dialogRef.clear();

	completeDroxSessionsSetupWithoutAuth(host);
}
