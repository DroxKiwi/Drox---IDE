/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { DROX_TOGGLEABLE_TOOL_NAMES } from '../../../common/droxToolCatalog.js';
import {
	applyDroxRegulationL2DisabledTools,
	applyDroxRegulationL2ExecutableTools,
	asDroxRegulationL2Module,
	droxRegulationL2AllowedToggleableTools,
} from '../../../common/regulation/droxRegulationL2Surface.js';

suite('Drox regulation R7 L2 surface', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('full leaves disabled list unchanged', () => {
		assert.deepStrictEqual(
			applyDroxRegulationL2DisabledTools('full', ['bash']),
			['bash'],
		);
		assert.strictEqual(droxRegulationL2AllowedToggleableTools('full'), undefined);
	});

	test('core disables web and skills', () => {
		const disabled = applyDroxRegulationL2DisabledTools('core', []);
		assert.ok(disabled.includes('web_search'));
		assert.ok(disabled.includes('skill_list'));
		assert.ok(disabled.includes('git_worktree_enter'));
		assert.ok(!disabled.includes('file_read'));
		assert.ok(!disabled.includes('bash'));
		assert.ok(!disabled.includes('ask_user_question'));
	});

	test('standard keeps codebase_search, disables web', () => {
		const disabled = applyDroxRegulationL2DisabledTools('standard', []);
		assert.ok(!disabled.includes('codebase_search'));
		assert.ok(disabled.includes('web_fetch'));
	});

	test('core filters executable client tools', () => {
		const names = ['bash', 'file_write', 'codebase_search', 'lsp'];
		assert.deepStrictEqual(
			applyDroxRegulationL2ExecutableTools('core', names),
			['bash', 'file_write'],
		);
	});

	test('asDroxRegulationL2Module falls back for non-L2 modules', () => {
		assert.strictEqual(asDroxRegulationL2Module('minimal'), 'standard');
		assert.strictEqual(asDroxRegulationL2Module('core'), 'core');
	});

	test('core allowlist is a subset of toggleable catalogue', () => {
		const allowed = droxRegulationL2AllowedToggleableTools('core')!;
		for (const name of allowed) {
			assert.ok(DROX_TOGGLEABLE_TOOL_NAMES.includes(name), name);
		}
	});
});
