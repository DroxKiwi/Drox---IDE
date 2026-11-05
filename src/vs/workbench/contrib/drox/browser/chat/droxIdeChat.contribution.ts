/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { $, append } from '../../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewExtensions, ViewContainerLocation } from '../../../../common/views.js';
import { TitleBarLeadingActionsGroup } from '../../../../browser/parts/titlebar/titlebarActions.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { DroxViews } from '../../common/drox.js';
import { DroxIdeNativeChatTabEnabledContext } from '../../common/droxAgentsConfiguration.js';
import { DroxDevSurfaceContext, isDroxDevFeatureEnabled } from '../../common/droxDevSurface.js';
import { openDroxIdeChatView } from './droxIdeChatViewRoute.js';
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

const TOGGLE_DROX_CHAT_TITLEBAR = 'workbench.action.toggleDroxChatTitleBar';

class ToggleDroxChatTitleBarAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_DROX_CHAT_TITLEBAR,
			title: localize2('drox.chatTitleBar', 'Chat'),
			f1: false,
			menu: {
				id: MenuId.TitleBar,
				group: TitleBarLeadingActionsGroup,
				order: -999,
				when: ContextKeyExpr.and(IsSessionsWindowContext.negate(), IsAuxiliaryWindowContext.negate()),
			},
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		if (layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
			layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
			return;
		}
		await openDroxIdeChatView(accessor, true);
	}
}

registerAction2(ToggleDroxChatTitleBarAction);

/** Title-bar chat control, beside Open in Agents. Green while the side chat is open. */
class DroxChatTitleBarWidget extends BaseActionViewItem {

	private host: HTMLElement | undefined;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IHoverService private readonly hoverService: IHoverService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.host = container;
		container.classList.add('drox-chat-titlebar-widget');
		container.setAttribute('role', 'button');

		const icon = append(container, $('span.drox-chat-titlebar-widget-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.commentDiscussion));
		icon.setAttribute('aria-hidden', 'true');

		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), container, localize('drox.chatTitleBar.hover', 'Chat')));
		this._register(this.layoutService.onDidChangePartVisibility(() => this.sync()));
		this.sync();
	}

	private sync(): void {
		const open = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		this.host?.classList.toggle('is-open', open);
		this.host?.setAttribute('aria-pressed', open ? 'true' : 'false');
	}
}

class DroxChatTitleBarContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.droxChatTitleBar';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(actionViewItemService.register(MenuId.TitleBar, TOGGLE_DROX_CHAT_TITLEBAR, (action, options) => {
			return instantiationService.createInstance(DroxChatTitleBarWidget, action, options);
		}, undefined));
	}
}

registerWorkbenchContribution2(DroxChatTitleBarContribution.ID, DroxChatTitleBarContribution, WorkbenchPhase.BlockRestore);

/** Lie `droxDevSurface` avant les `when` du titre de chat (bouton bug). */
class DroxDevSurfaceContextContribution implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.droxDevSurfaceContext';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IProductService productService: IProductService,
	) {
		DroxDevSurfaceContext.bindTo(contextKeyService).set(isDroxDevFeatureEnabled('runCapture', productService));
	}
}

registerWorkbenchContribution2(
	DroxDevSurfaceContextContribution.ID,
	DroxDevSurfaceContextContribution,
	WorkbenchPhase.BlockStartup,
);
