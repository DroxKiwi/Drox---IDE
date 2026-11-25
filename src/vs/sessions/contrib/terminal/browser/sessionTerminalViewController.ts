/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, getWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { TerminalEditorInput } from '../../../../workbench/contrib/terminal/browser/terminalEditorInput.js';
import { ITerminalInstance } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { SessionsTerminalContribution } from './sessionsTerminalContribution.js';

/**
 * Associates terminal editor tabs with the owning session so archive/remove
 * cleanup and session working-set restore stay consistent (mirrors
 * {@link SessionBrowserViewController} for browser tabs).
 */
export class SessionTerminalViewController extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionTerminalViewController';

	private readonly _trackedInputResources = new Set<string>();

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService private readonly _editorGroupsService: IEditorGroupsService,
	) {
		super();

		this._register(this._editorService.onWillOpenEditor(e => {
			if (e.editor instanceof TerminalEditorInput) {
				this._attachLifecycle(e.editor);
			}
		}));

		// Working-set restore deserializes editors without firing onWillOpenEditor.
		this._register(this._editorGroupsService.onDidAddGroup(group => {
			for (const editor of group.editors) {
				if (editor instanceof TerminalEditorInput) {
					this._attachLifecycle(editor);
				}
			}
		}));
	}

	private _attachLifecycle(input: TerminalEditorInput): void {
		const key = input.resource.toString();
		if (this._trackedInputResources.has(key)) {
			return;
		}
		this._trackedInputResources.add(key);

		const attachInstance = (instance: ITerminalInstance) => {
			getWorkbenchContribution<SessionsTerminalContribution>(SessionsTerminalContribution.ID)
				.attachTerminalToSession(instance);
		};

		const instance = input.terminalInstance;
		if (instance) {
			attachInstance(instance);
		} else {
			this._register(input.onDidRequestAttach(attachInstance));
		}

		this._register(input.onWillDispose(() => {
			this._trackedInputResources.delete(key);
		}));
	}
}
