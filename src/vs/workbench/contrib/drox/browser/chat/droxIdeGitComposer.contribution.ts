/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { $ } from '../../../../../base/browser/dom.js';
import { IActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { Action2, MenuItemAction, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { Menus } from '../../../../../sessions/browser/menus.js';
import { SessionHeaderMetaActionViewItem } from '../../../../../sessions/browser/parts/sessionHeaderMetaActionViewItem.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IsSessionsWindowContext, VirtualWorkspaceContext } from '../../../../common/contextkeys.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';

import { IGitService } from '../../../git/common/gitService.js';
import {
	DroxIdeHasUncommittedChangesContextKey,
	DroxIdeNativeChatTabEnabledContext,
	isDroxIdeNativeChatTabEnabled,
} from '../../common/droxAgentsConfiguration.js';
import { DroxViews } from '../../common/drox.js';
import { DroxChatSessionUri } from '../../common/droxAgentsSession.js';
import { buildDroxIdeChangesCategories } from '../../common/droxIdeChangesModel.js';
import { IDroxIdeChangesUiState } from '../../common/droxIdeChangesUiState.js';
import { IDroxSessionChangesDetailService } from '../../common/droxSessionChangesDetailService.js';
import { IDroxSessionService } from '../../common/droxSessionService.js';
import { DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY } from '../../common/droxSharedChatSessionHistory.js';
import { DroxNativeChatSessionStore } from './droxNativeChatSessionStore.js';
import '../droxSessionGitComposerActions.js';

export const DROX_IDE_VIEW_CHANGES_ACTION_ID = 'workbench.action.droxIde.viewChanges';

const droxIdeViewChangesWhen = ContextKeyExpr.and(
	IsSessionsWindowContext.negate(),
	DroxIdeNativeChatTabEnabledContext,
	DroxIdeHasUncommittedChangesContextKey,
	VirtualWorkspaceContext.isEqualTo(''),
);

registerAction2(class DroxIdeViewChangesAction extends Action2 {
	constructor() {
		super({
			id: DROX_IDE_VIEW_CHANGES_ACTION_ID,
			title: localize2('drox.ide.viewChanges', 'Changes'),
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const viewsService = accessor.get(IViewsService);
		await viewsService.openViewContainer(DroxViews.ChangesViewContainerId, true);
		await viewsService.openView(DroxViews.ChangesViewId, true);
	}
});

MenuRegistry.appendMenuItem(Menus.SessionComposerQuickActions, {
	command: { id: DROX_IDE_VIEW_CHANGES_ACTION_ID, title: localize2('drox.ide.viewChanges', 'Changes') },
	group: 'navigation',
	order: 0,
	when: droxIdeViewChangesWhen,
});

class DroxIdeViewChangesActionViewItem extends SessionHeaderMetaActionViewItem {

	constructor(
		action: MenuItemAction,
		options: IActionViewItemOptions,
		@IDroxIdeChangesUiState private readonly uiState: IDroxIdeChangesUiState,
	) {
		super(undefined, action, options);
		this._register(uiState.onDidChange(() => {
			this.updateLabel();
			this.updateTooltip();
		}));
	}

	protected override getAdditionalLabelContent(): Array<HTMLElement | string> {
		const { added, removed } = this.uiState.stats;
		return [
			$('span.chat-composite-bar-meta-added', undefined, `+${added}`),
			$('span.chat-composite-bar-meta-removed', undefined, `-${removed}`),
		];
	}

	protected override getTooltip(): string {
		return localize('drox.ide.viewChanges.tooltip', 'View Changes');
	}
}

/**
 * Keeps IDE Changes UI state + context keys in sync so composer Commit pills
 * appear even when the Changes sidebar view is not open.
 */
class DroxIdeGitComposerContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxIdeGitComposer';

	private readonly _sessionStore: DroxNativeChatSessionStore;
	private readonly _hasChangesKey;
	private _refreshGeneration = 0;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IGitService private readonly gitService: IGitService,
		@IDroxSessionChangesDetailService private readonly detailService: IDroxSessionChangesDetailService,
		@IDroxSessionService private readonly sessionService: IDroxSessionService,
		@IStorageService private readonly storageService: IStorageService,
		@IDroxIdeChangesUiState private readonly uiState: IDroxIdeChangesUiState,
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._sessionStore = instantiationService.createInstance(DroxNativeChatSessionStore);
		this._hasChangesKey = DroxIdeHasUncommittedChangesContextKey.bindTo(contextKeyService);

		const onDidRegister = this._register(new Emitter<void>());
		this._register(actionViewItemService.register(Menus.SessionComposerQuickActions, DROX_IDE_VIEW_CHANGES_ACTION_ID, (action, options, inst) => {
			if (!(action instanceof MenuItemAction)) {
				return undefined;
			}
			return inst.createInstance(DroxIdeViewChangesActionViewItem, action, options);
		}, onDidRegister.event));
		onDidRegister.fire();

		this._register(this.uiState.onDidChange(() => {
			this._hasChangesKey.set(this.uiState.hasUncommittedChanges);
		}));
		this._hasChangesKey.set(this.uiState.hasUncommittedChanges);

		this._register(this.detailService.onDidChange(() => void this._refresh()));
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => void this._refresh()));
		this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, DROX_WORKSPACE_SESSION_RECENCY_STORAGE_KEY, this._store)(() => {
			void this._refresh();
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('drox.ideNativeChatTab.enabled')) {
				void this._refresh();
			}
		}));

		void this._refresh();
	}

	private async _refresh(): Promise<void> {
		if (!isDroxIdeNativeChatTabEnabled(this.configurationService)) {
			this.uiState.setSnapshot(undefined, undefined);
			return;
		}

		const generation = ++this._refreshGeneration;
		const sessionId = this._sessionStore.getActiveSessionId();
		const sessionResource = sessionId ? DroxChatSessionUri.forSession(sessionId) : undefined;
		const ws = this.workspaceContextService.getWorkspace().folders[0]?.uri.fsPath;
		if (!ws || !sessionId || !sessionResource) {
			if (generation === this._refreshGeneration) {
				this.uiState.setSnapshot(undefined, undefined);
			}
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
			this.uiState.setSnapshot(sessionResource, categories.flatMap(c => [...c.changes]));
		} catch {
			if (generation === this._refreshGeneration) {
				this.uiState.setSnapshot(sessionResource, undefined);
			}
		}
	}
}

registerWorkbenchContribution2(
	DroxIdeGitComposerContribution.ID,
	DroxIdeGitComposerContribution,
	WorkbenchPhase.AfterRestored,
);
