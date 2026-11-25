/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { BaseActionViewItem, IBaseActionViewItemOptions } from '../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { getDefaultHoverDelegate } from '../../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../../nls.js';
import { ServicesAccessor } from '../../../../../editor/browser/editorExtensions.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { IActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../common/contextkeys.js';
import { TitleBarLeadingActionsGroup } from '../../../../browser/parts/titlebar/titlebarActions.js';
import { Menus } from '../../../../../sessions/browser/menus.js';
import { IsPhoneLayoutContext, SessionsWelcomeVisibleContext } from '../../../../../sessions/common/contextkeys.js';
import { IDroxTutorialService } from './droxTutorial.js';

const TOGGLE_DROX_TUTORIAL = 'workbench.action.toggleDroxTutorial';
const TOGGLE_DROX_AGENTS_TUTORIAL = 'workbench.action.toggleDroxAgentsTutorial';

class ToggleDroxTutorialAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_DROX_TUTORIAL,
			title: localize2('drox.tutorialTitleBar', 'Tutorial'),
			f1: false,
			menu: {
				id: MenuId.TitleBar,
				group: TitleBarLeadingActionsGroup,
				order: -1001,
				when: ContextKeyExpr.and(IsSessionsWindowContext.negate(), IsAuxiliaryWindowContext.negate()),
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(IDroxTutorialService).toggle();
	}
}

registerAction2(ToggleDroxTutorialAction);

/** Agents window: book icon immediately left of Open Git Graph (order 9). */
class ToggleDroxAgentsTutorialAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_DROX_AGENTS_TUTORIAL,
			title: localize2('drox.tutorialAgentsTitleBar', 'Tutorial'),
			tooltip: localize('drox.tutorialAgentsTitleBar.hover', 'Tutorial'),
			icon: Codicon.book,
			f1: false,
			menu: {
				id: Menus.TitleBarSessionMenu,
				group: 'navigation',
				order: 8,
				when: ContextKeyExpr.and(
					IsAuxiliaryWindowContext.toNegated(),
					SessionsWelcomeVisibleContext.toNegated(),
					IsPhoneLayoutContext.negate(),
				),
			},
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(IDroxTutorialService).toggle();
	}
}

registerAction2(ToggleDroxAgentsTutorialAction);

class DroxTutorialTitleBarWidget extends BaseActionViewItem {

	private host: HTMLElement | undefined;

	constructor(
		action: IAction,
		options: IBaseActionViewItemOptions | undefined,
		@IHoverService private readonly hoverService: IHoverService,
		@IDroxTutorialService private readonly tutorial: IDroxTutorialService,
	) {
		super(undefined, action, options);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.host = container;
		container.classList.add('drox-tutorial-titlebar-widget');
		container.setAttribute('role', 'button');

		const icon = append(container, $('span.drox-tutorial-titlebar-widget-icon'));
		icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.book));
		icon.setAttribute('aria-hidden', 'true');

		this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate('element'), container, localize('drox.tutorialTitleBar.hover', 'Tutorial')));
		this._register(this.tutorial.onDidChange(() => this.sync()));
		this.sync();
	}

	private sync(): void {
		const open = this.tutorial.active;
		this.host?.classList.toggle('is-open', open);
		this.host?.setAttribute('aria-pressed', open ? 'true' : 'false');
	}
}

class DroxTutorialContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.droxTutorial';

	constructor(
		@IActionViewItemService actionViewItemService: IActionViewItemService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const factory = (action: IAction, options: IBaseActionViewItemOptions | undefined) => {
			return instantiationService.createInstance(DroxTutorialTitleBarWidget, action, options);
		};
		this._register(actionViewItemService.register(MenuId.TitleBar, TOGGLE_DROX_TUTORIAL, factory, undefined));
		this._register(actionViewItemService.register(Menus.TitleBarSessionMenu, TOGGLE_DROX_AGENTS_TUTORIAL, factory, undefined));
	}
}

registerWorkbenchContribution2(DroxTutorialContribution.ID, DroxTutorialContribution, WorkbenchPhase.BlockRestore);
