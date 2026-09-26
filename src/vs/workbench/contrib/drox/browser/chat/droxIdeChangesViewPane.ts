/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { DroxChangesInlineDiffWidget } from '../../../../../sessions/contrib/providers/drox/browser/droxChangesInlineDiffWidget.js';
import { ISessionFileChange } from '../../../../../sessions/services/sessions/common/session.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IGitService } from '../../../git/common/gitService.js';
import { DroxChatSessionUri } from '../../common/droxAgentsSession.js';
import { buildDroxIdeChangesCategories } from '../../common/droxIdeChangesModel.js';
import { IDroxSessionChangesDetailService } from '../../common/droxSessionChangesDetailService.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import {
	DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY,
} from '../../common/droxSharedChatSessionHistory.js';
import { DroxNativeChatSessionStore } from './droxNativeChatSessionStore.js';
import './media/droxIdeChanges.css';

/**
 * IDE Changes view — same inline widget as Agents (`DroxChangesInlineDiffWidget`),
 * hosted in a Sidebar activity-bar container (like Source Control).
 */
export class DroxIdeChangesViewPane extends ViewPane {

	private _host: HTMLElement | undefined;
	private _widget: DroxChangesInlineDiffWidget | undefined;
	private readonly _widgetStore = this._register(new DisposableStore());
	private readonly _sessionStore: DroxNativeChatSessionStore;
	private readonly _sessionResourceObs = observableValue<URI | undefined>('droxIdeChangesSession', undefined);
	private readonly _mergedFilesObs = observableValue<readonly ISessionFileChange[] | undefined>('droxIdeChangesMerged', undefined);
	private _refreshGeneration = 0;

	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IGitService private readonly gitService: IGitService,
		@IDroxSessionChangesDetailService private readonly detailService: IDroxSessionChangesDetailService,
		@IDroxSessionService private readonly sessionService: IDroxSessionService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this._sessionStore = instantiationService.createInstance(DroxNativeChatSessionStore);

		this._register(this.detailService.onDidChange(() => void this._refreshMerged()));
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => void this._syncSessionAndRefresh()));
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY, this._store)(() => {
			void this._syncSessionAndRefresh();
		}));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('drox-ide-changes');
		this._host = dom.append(container, dom.$('.drox-changes-inline-host'));
		this._widgetStore.clear();
		this._widget = this._widgetStore.add(this.instantiationService.createInstance(
			DroxChangesInlineDiffWidget,
			{
				parent: this._host,
				sessionResourceObs: this._sessionResourceObs,
				externalMergedFilesObs: this._mergedFilesObs,
			},
		));
		void this._syncSessionAndRefresh();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this._host) {
			this._host.style.height = `${height}px`;
			this._host.style.width = `${width}px`;
		}
		this._widget?.layout(height, width);
	}

	private async _syncSessionAndRefresh(): Promise<void> {
		const sessionId = this._sessionStore.getActiveSessionId();
		const next = sessionId ? DroxChatSessionUri.forSession(sessionId) : undefined;
		const prev = this._sessionResourceObs.get();
		if (prev?.toString() !== next?.toString()) {
			this._sessionResourceObs.set(next, undefined);
			this._mergedFilesObs.set(undefined, undefined);
		}
		await this._refreshMerged();
	}

	private async _refreshMerged(): Promise<void> {
		const generation = ++this._refreshGeneration;
		const sessionResource = this._sessionResourceObs.get();
		const ws = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
		const sessionId = sessionResource ? DroxChatSessionUri.parseSessionId(sessionResource) : undefined;
		if (!ws || !sessionId) {
			this._mergedFilesObs.set(undefined, undefined);
			return;
		}

		try {
			const categories = await buildDroxIdeChangesCategories({
				workspaceFsPath: ws,
				engineSessionId: sessionId,
				fileService: this.fileService,
				gitService: this.gitService,
				detailService: this.detailService,
				sessionService: this.sessionService,
			});
			if (generation !== this._refreshGeneration) {
				return;
			}
			this._mergedFilesObs.set(categories.flatMap(c => [...c.changes]), undefined);
		} catch {
			if (generation === this._refreshGeneration) {
				this._mergedFilesObs.set(undefined, undefined);
			}
		}
	}
}
