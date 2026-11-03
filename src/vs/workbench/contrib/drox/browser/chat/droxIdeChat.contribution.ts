/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IViewContainersRegistry, IViewsRegistry, IViewDescriptorService, Extensions as ViewExtensions, ViewContainerLocation, WindowEnablement } from '../../../../common/views.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
import { DroxCommands, DroxViews } from '../../common/drox.js';
import { DroxIdeNativeChatTabEnabledContext } from '../../common/droxAgentsConfiguration.js';
import { DroxNativeChatViewPane } from './droxNativeChatViewPane.js';
import { DroxIdeChangesViewPane } from './droxIdeChangesViewPane.js';
import { registerDroxNativeChatViewActions } from './droxNativeChatViewActions.js';
import './droxIdeSessionChangesBridge.contribution.js';
import './droxIdeGitComposer.contribution.js';

registerDroxNativeChatViewActions();

const droxNativeChatViewIcon = registerIcon(
	'drox-native-chat-view-icon',
	Codicon.sparkle,
	localize('droxNativeChatViewIcon', 'View icon of the Drox native chat tab.'),
);

const droxChangesViewIcon = registerIcon(
	'drox-ide-changes-view-icon',
	Codicon.gitCompare,
	localize('droxIdeChangesViewIcon', 'View icon of the Drox Changes panel.'),
);

// Loaded after `drox.contribution` (workbench.common.main) — resolve container by id, no circular import.
const droxViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).get(DroxViews.ViewContainerId);
if (droxViewContainer) {
	Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
		id: DroxViews.NativeChatViewId,
		name: localize2('drox.nativeChatView.label', 'Drox'),
		containerIcon: droxNativeChatViewIcon,
		containerTitle: droxViewContainer.title.value,
		canToggleVisibility: true,
		canMoveView: false,
		order: 0,
		ctorDescriptor: new SyncDescriptor(DroxNativeChatViewPane),
		when: DroxIdeNativeChatTabEnabledContext,
	}], droxViewContainer);
}

/** Sidebar activity-bar entry — replaces Explorer when opened (SCM-like). */
const changesViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: DroxViews.ChangesViewContainerId,
	title: localize2('drox.ideChangesContainer.label', 'Changes'),
	icon: droxChangesViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DroxViews.ChangesViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DroxViews.ChangesViewContainerId,
	hideIfEmpty: false,
	order: 3,
	openCommandActionDescriptor: {
		id: DroxViews.ChangesViewContainerId,
		mnemonicTitle: localize({ key: 'miDroxChanges', comment: ['&& denotes a mnemonic'] }, "Chan&&ges"),
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG,
		},
		order: 3,
	},
}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: DroxViews.ChangesViewId,
	name: localize2('drox.ideChangesView.label', 'Changes'),
	containerIcon: droxChangesViewIcon,
	containerTitle: localize('drox.ideChangesContainer.title', 'Changes'),
	singleViewPaneContainerTitle: localize('drox.ideChangesContainer.title', 'Changes'),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	order: 0,
	ctorDescriptor: new SyncDescriptor(DroxIdeChangesViewPane),
	when: DroxIdeNativeChatTabEnabledContext,
}], changesViewContainer);

const droxChatRevealIcon = registerIcon(
	'drox-chat-reveal-view-icon',
	Codicon.commentDiscussion,
	localize('droxChatRevealViewIcon', 'View icon that shows the Drox chat when it is hidden.'),
);

/** IDE activity bar only. Clicking toggles the auxiliary chat open or closed. */
const chatRevealViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: DroxViews.ChatRevealViewContainerId,
	title: localize2('drox.chatRevealContainer.label', 'Chat'),
	icon: droxChatRevealIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DroxViews.ChatRevealViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DroxViews.ChatRevealViewContainerId,
	hideIfEmpty: false,
	order: 9,
	windowEnablement: WindowEnablement.Editor,
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: true });

class DroxChatRevealViewPane extends ViewPane {

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
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		const note = document.createElement('p');
		note.textContent = localize('drox.chatReveal.note', 'The chat opens on the side.');
		container.appendChild(note);
	}
}

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: DroxViews.ChatRevealViewId,
	name: localize2('drox.chatRevealView.label', 'Chat'),
	containerIcon: droxChatRevealIcon,
	containerTitle: localize('drox.chatRevealContainer.title', 'Chat'),
	singleViewPaneContainerTitle: localize('drox.chatRevealContainer.title', 'Chat'),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	order: 0,
	windowEnablement: WindowEnablement.Editor,
	ctorDescriptor: new SyncDescriptor(DroxChatRevealViewPane),
}], chatRevealViewContainer);

class DroxChatRevealContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.droxChatReveal';

	private lastSidebarId: string | undefined;
	private sidebarWasVisible: boolean;
	private pending = false;

	constructor(
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
		this.sidebarWasVisible = layoutService.isVisible(Parts.SIDEBAR_PART);
		this.lastSidebarId = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar)?.getId();

		this._register(layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.SIDEBAR_PART && !e.visible) {
				this.sidebarWasVisible = false;
			}
		}));

		this._register(paneCompositeService.onDidPaneCompositeOpen(e => {
			if (e.viewContainerLocation !== ViewContainerLocation.Sidebar) {
				return;
			}
			const id = e.composite.getId();
			if (id !== DroxViews.ChatRevealViewContainerId) {
				this.lastSidebarId = id;
			}
			if (this.pending) {
				return;
			}
			const sidebarWasVisible = this.sidebarWasVisible;
			this.pending = true;
			queueMicrotask(() => {
				this.pending = false;
				const current = this.paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
				if (current?.getId() !== DroxViews.ChatRevealViewContainerId) {
					this.sidebarWasVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
					return;
				}
				void this.finish(sidebarWasVisible);
			});
		}));
	}

	private async finish(sidebarWasVisible: boolean): Promise<void> {
		const chatHidden = !this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		if (chatHidden) {
			await this.commandService.executeCommand(DroxCommands.OpenChat);
		} else {
			this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		}
		if (!sidebarWasVisible) {
			this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
		} else if (this.lastSidebarId && this.lastSidebarId !== DroxViews.ChatRevealViewContainerId) {
			await this.paneCompositeService.openPaneComposite(this.lastSidebarId, ViewContainerLocation.Sidebar, !chatHidden);
		}
		if (chatHidden) {
			this.layoutService.focusPart(Parts.AUXILIARYBAR_PART);
		}
		this.sidebarWasVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
	}
}

registerWorkbenchContribution2(DroxChatRevealContribution.ID, DroxChatRevealContribution, WorkbenchPhase.AfterRestored);
