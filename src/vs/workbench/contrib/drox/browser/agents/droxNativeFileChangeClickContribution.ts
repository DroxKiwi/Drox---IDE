/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Secours clic carte file-change : si le lien `command:` markdown est mangé /
 * bloqué, un clic sur `.fc-path` (ou le chemin dans le summary) ouvre quand même
 * le fichier via `DroxCommands.OpenSessionFile` (data-path / title / text).
 */

import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { isDroxNativeChatStackEnabled } from '../../common/droxAgentsConfiguration.js';
import { DroxCommands } from '../../common/drox.js';
import * as dom from '../../../../../base/browser/dom.js';
import { resolveFileChangeOpenTarget } from './droxNativeFileChangeClick.js';

class DroxNativeFileChangeClickContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxNativeFileChangeClick';

	constructor(
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		if (!isDroxNativeChatStackEnabled(configurationService)) {
			return;
		}

		for (const widget of chatWidgetService.getAllWidgets()) {
			this.attachWidget(widget);
		}
		this._register(chatWidgetService.onDidAddWidget(widget => this.attachWidget(widget)));
	}

	private attachWidget(widget: IChatWidget): void {
		const store = new DisposableStore();
		this._register(store);
		store.add(dom.addDisposableListener(widget.domNode, 'click', e => {
			const target = resolveFileChangeOpenTarget(e.target);
			if (!target) {
				return;
			}
			// Capture: take over before markdown `command:` opener (often silently no-ops in chat).
			e.preventDefault();
			e.stopPropagation();
			void this.commandService.executeCommand(
				DroxCommands.OpenSessionFile,
				target.path,
				target.toolId,
			);
		}, true));
	}
}

registerWorkbenchContribution2(
	DroxNativeFileChangeClickContribution.ID,
	DroxNativeFileChangeClickContribution,
	WorkbenchPhase.AfterRestored,
);
