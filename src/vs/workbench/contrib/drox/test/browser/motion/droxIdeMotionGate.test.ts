/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { EditorInputCapabilities } from '../../../../../common/editor.js';
import { EditorInput } from '../../../../../common/editor/editorInput.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { DroxMotionSetting } from '../../../browser/motion/droxMotionConfiguration.js';
import { DroxMotionSurface } from '../../../browser/motion/droxMotionSurface.js';
import { droxMotionSurfaceForWorkbench, shouldRunDroxIdeEditorReveal } from '../../../browser/motion/ide/droxIdeMotionGate.js';

class TestEditorInput extends EditorInput {
	static readonly ID = 'test.editorInput';
	override get typeId(): string { return TestEditorInput.ID; }
	constructor(readonly uri: URI) { super(); }
	override get resource(): URI { return this.uri; }
}

suite('Drox IDE motion gate', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const envIde = { isSessionsWindow: false } as IWorkbenchEnvironmentService;
	const envAgent = { isSessionsWindow: true } as IWorkbenchEnvironmentService;

	test('surface detection', () => {
		assert.strictEqual(droxMotionSurfaceForWorkbench(envIde), DroxMotionSurface.Ide);
		assert.strictEqual(droxMotionSurfaceForWorkbench(envAgent), DroxMotionSurface.Agent);
	});

	test('skips agents window', () => {
		const config = new TestConfigurationService({ [DroxMotionSetting.IdeEditorRevealEnabled]: true });
		const input = new TestEditorInput(URI.file('/tmp/a.ts'));
		assert.strictEqual(shouldRunDroxIdeEditorReveal(input, config, envAgent), false);
	});

	test('allows file editor in IDE', () => {
		const config = new TestConfigurationService({ [DroxMotionSetting.IdeEditorRevealEnabled]: true });
		const input = new TestEditorInput(URI.file('/tmp/a.ts'));
		assert.strictEqual(shouldRunDroxIdeEditorReveal(input, config, envIde), true);
	});

	test('respects setting off', () => {
		const config = new TestConfigurationService({ [DroxMotionSetting.IdeEditorRevealEnabled]: false });
		const input = new TestEditorInput(URI.file('/tmp/a.ts'));
		assert.strictEqual(shouldRunDroxIdeEditorReveal(input, config, envIde), false);
	});

	test('skips scratchpad inputs', () => {
		const config = new TestConfigurationService({ [DroxMotionSetting.IdeEditorRevealEnabled]: true });
		class ScratchpadInput extends TestEditorInput {
			override get capabilities(): EditorInputCapabilities { return EditorInputCapabilities.Scratchpad; }
		}
		const input = new ScratchpadInput(URI.file('/tmp/a.ts'));
		assert.strictEqual(shouldRunDroxIdeEditorReveal(input, config, envIde), false);
	});
});
