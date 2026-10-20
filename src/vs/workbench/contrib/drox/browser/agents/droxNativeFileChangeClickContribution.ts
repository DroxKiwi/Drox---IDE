/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Secours clic carte file-change : si le lien `command:` markdown est mangé /
 * bloqué (cible Text, allowCommands silent no-op), un clic sur `.fc-path`
 * (ou le summary) ouvre le fichier via `DroxCommands.OpenSessionFile`.
 *
 * Écoute au niveau `document` (capture) — pas seulement `ChatWidget.domNode` —
 * pour couvrir Agents / IDE / listes reparentées.
 */

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { addDisposableListener, getWindows, onDidRegisterWindow } from '../../../../../base/browser/dom.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { isDroxNativeChatStackEnabled } from '../../common/droxAgentsConfiguration.js';
import { DroxCommands } from '../../common/drox.js';
import { resolveFileChangeOpenTarget } from './droxNativeFileChangeClick.js';

class DroxNativeFileChangeClickContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxNativeFileChangeClick';

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		if (!isDroxNativeChatStackEnabled(configurationService)) {
			return;
		}

		for (const { window } of getWindows()) {
			this.attachDocument(window.document);
		}
		this._register(onDidRegisterWindow(({ window }) => this.attachDocument(window.document)));
	}

	private attachDocument(doc: Document): void {
		this._register(addDisposableListener(doc, 'click', e => {
			const target = resolveFileChangeOpenTarget(e.target);
			if (!target) {
				return;
			}
			// Capture: take over before markdown `command:` opener (often silently no-ops in chat).
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			this.logService.info(`[Drox] file-change path click → openSessionFile path=${target.path}`);
			void this.commandService.executeCommand(
				DroxCommands.OpenSessionFile,
				target.path,
				target.toolId,
			).catch(err => {
				this.logService.warn('[Drox] openSessionFile command failed', err);
			});
		}, true));
	}
}

registerWorkbenchContribution2(
	DroxNativeFileChangeClickContribution.ID,
	DroxNativeFileChangeClickContribution,
	WorkbenchPhase.AfterRestored,
);
