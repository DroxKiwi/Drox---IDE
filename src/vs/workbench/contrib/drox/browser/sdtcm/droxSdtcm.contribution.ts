/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../../nls.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { InputFocusedContext } from '../../../../../platform/contextkey/common/contextkeys.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../../platform/theme/common/iconRegistry.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../browser/editor.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { EditorExtensions } from '../../../../common/editor.js';
import { ActiveEditorContext } from '../../../../common/contextkeys.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewExtensions, ViewContainerLocation } from '../../../../common/views.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { DroxCommands, DroxViews } from '../../common/drox.js';
import { DroxSdtcmEditor } from './droxSdtcmEditor.js';
import { DROX_SDTCM_EDITOR_ID, DroxSdtcmInput } from './droxSdtcmInput.js';
import './droxSdtcmService.js';
import { DroxSdtcmViewPane } from './droxSdtcmViewPane.js';

const sdtcmViewIcon = registerIcon(
	'drox-sdtcm-view-icon',
	Codicon.map,
	localize('droxSdtcmViewIcon', 'View icon of the Drox SDTCM map.'),
);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		DroxSdtcmEditor,
		DROX_SDTCM_EDITOR_ID,
		localize('drox.sdtcm.editorLabel', 'SDTCM'),
	),
	[new SyncDescriptor(DroxSdtcmInput)],
);

const sdtcmViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry).registerViewContainer({
	id: DroxViews.SdtcmViewContainerId,
	title: localize2('drox.sdtcmContainer.label', 'SDTCM'),
	activityBarTooltip: localize('drox.sdtcm.activityTooltip', 'The selected model is called to build and update the map. This spends tokens.'),
	icon: sdtcmViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [DroxViews.SdtcmViewContainerId, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: DroxViews.SdtcmViewContainerId,
	hideIfEmpty: false,
	order: 8,
	openCommandActionDescriptor: {
		id: DroxViews.SdtcmViewContainerId,
		mnemonicTitle: localize({ key: 'miDroxSdtcm', comment: ['&& denotes a mnemonic'] }, '&&SDTCM'),
		order: 8,
	},
}, ViewContainerLocation.Sidebar);

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry).registerViews([{
	id: DroxViews.SdtcmViewId,
	name: localize2('drox.sdtcmView.label', 'SDTCM'),
	containerIcon: sdtcmViewIcon,
	containerTitle: localize('drox.sdtcmContainer.title', 'SDTCM'),
	singleViewPaneContainerTitle: localize('drox.sdtcmContainer.title', 'SDTCM'),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	order: 0,
	ctorDescriptor: new SyncDescriptor(DroxSdtcmViewPane),
}], sdtcmViewContainer);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: DroxCommands.OpenSdtcm,
			title: localize2('drox.sdtcm.open', 'Drox: SDTCM'),
			category: Categories.View,
			f1: true,
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		await editorService.openEditor(new DroxSdtcmInput(), { pinned: true });
	}
});

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: DroxCommands.CenterSdtcm,
			title: localize2('drox.sdtcm.center', 'SDTCM: Center on the most linked folder'),
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.Space,
				when: ContextKeyExpr.and(
					ActiveEditorContext.isEqualTo(DROX_SDTCM_EDITOR_ID),
					EditorContextKeys.editorTextFocus.toNegated(),
					InputFocusedContext.toNegated(),
				),
			},
		});
	}

	run(accessor: ServicesAccessor): void {
		const pane = accessor.get(IEditorService).activeEditorPane;
		if (pane instanceof DroxSdtcmEditor) {
			pane.centerOnMostLinked();
		}
	}
});
