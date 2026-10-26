/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { isCodeEditor } from '../../../../../../editor/browser/editorBrowser.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { EditorResourceAccessor } from '../../../../../common/editor.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { playDroxIdeEditorReveal } from './editorReveal/droxIdeEditorRevealEffect.js';
import { shouldRunDroxIdeEditorReveal } from './droxIdeMotionGate.js';

class DroxIdeEditorRevealContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxIdeEditorReveal';

	private activeReveal: IDisposable | undefined;
	private readonly seenEditorKeys = new Set<string>();

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		this._register(this.editorService.onWillOpenEditor(e => {
			this.scheduleRevealForEditor(e.editor);
		}));
	}

	private editorKey(editor: EditorInput): string {
		const uri = EditorResourceAccessor.getCanonicalUri(editor);
		return `${editor.typeId}:${uri?.toString() ?? ''}`;
	}

	private scheduleRevealForEditor(editor: EditorInput): void {
		if (!shouldRunDroxIdeEditorReveal(editor, this.configurationService, this.environmentService)) {
			return;
		}
		const key = this.editorKey(editor);
		if (this.seenEditorKeys.has(key)) {
			return;
		}
		this.seenEditorKeys.add(key);

		const run = () => {
			const pane = this.editorService.activeEditorPane;
			if (!pane || pane.input !== editor) {
				return;
			}
			const control = pane.getControl();
			if (!isCodeEditor(control)) {
				return;
			}
			const host = control.getContainerDomNode();
			this.activeReveal?.dispose();
			this.activeReveal = playDroxIdeEditorReveal(host);
		};

		requestAnimationFrame(() => requestAnimationFrame(run));
	}

	override dispose(): void {
		this.activeReveal?.dispose();
		super.dispose();
	}
}

registerWorkbenchContribution2(
	DroxIdeEditorRevealContribution.ID,
	DroxIdeEditorRevealContribution,
	WorkbenchPhase.AfterRestored,
);
