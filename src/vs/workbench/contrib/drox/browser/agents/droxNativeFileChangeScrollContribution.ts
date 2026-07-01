/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { isDroxNativeChatStackEnabled } from '../../common/droxAgentsConfiguration.js';
import { installDroxFileChangeWheelScrollIsolation } from './droxNativeFileChangeScrolling.js';

class DroxNativeFileChangeScrollContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxNativeFileChangeScroll';

	constructor(
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		if (!isDroxNativeChatStackEnabled(configurationService)) {
			return;
		}

		for (const widget of this.chatWidgetService.getAllWidgets()) {
			this.attachWidget(widget);
		}
		this._register(this.chatWidgetService.onDidAddWidget(widget => this.attachWidget(widget)));
	}

	private attachWidget(widget: IChatWidget): void {
		const store = new DisposableStore();
		this._register(store);
		store.add(installDroxFileChangeWheelScrollIsolation(widget.domNode));
	}
}

registerWorkbenchContribution2(
	DroxNativeFileChangeScrollContribution.ID,
	DroxNativeFileChangeScrollContribution,
	WorkbenchPhase.AfterRestored,
);
