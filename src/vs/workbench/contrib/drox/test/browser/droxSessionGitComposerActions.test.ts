/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildDroxCommitAgentPrompt, buildDroxCreatePullRequestAgentPrompt } from '../../browser/droxSessionGitComposerActions.js';

suite('DroxSessionGitComposerActions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('buildDroxCommitAgentPrompt includes slash commit and push tail', () => {
		const withPush = buildDroxCommitAgentPrompt(true);
		assert.ok(withPush.startsWith('/commit'));
		assert.ok(withPush.includes('git commit'));
		assert.ok(withPush.toLowerCase().includes('push'));

		const withoutPush = buildDroxCommitAgentPrompt(false);
		assert.ok(withoutPush.includes('Do not push'));
	});

	test('buildDroxCreatePullRequestAgentPrompt references gh CLI', () => {
		const prompt = buildDroxCreatePullRequestAgentPrompt();
		assert.ok(prompt.includes('gh pr create'));
		assert.ok(prompt.includes('gh auth status'));
	});
});
