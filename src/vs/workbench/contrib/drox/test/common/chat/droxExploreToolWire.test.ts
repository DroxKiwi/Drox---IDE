/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	buildExploreSubagentToolSpecificData,
	buildExploreToolFinishWire,
	buildExploreToolStartWire,
} from '../../../common/chat/droxExploreToolWire.js';

suite('Drox — Explore tool wire', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('buildExploreToolStartWire extracts description and thoroughness', () => {
		const wire = buildExploreToolStartWire('task', {
			description: 'Find auth entry points',
			thoroughness: 'medium',
			subagent_type: 'explore',
		});
		assert.deepStrictEqual(wire, {
			exploreDescription: 'Find auth entry points',
			exploreThoroughness: 'medium',
		});
	});

	test('buildExploreSubagentToolSpecificData matches Cursor subagent shape', () => {
		const data = buildExploreSubagentToolSpecificData(
			{ exploreDescription: 'Find alert config', exploreThoroughness: 'quick' },
			{ exploreReport: 'Alerts live in droxConfiguration.' },
		);
		assert.deepStrictEqual(data, {
			kind: 'subagent',
			agentName: 'explore',
			description: 'Find alert config',
			prompt: 'Find alert config',
			result: 'Alerts live in droxConfiguration.',
		});
	});

	test('buildExploreToolStartWire ignores non-task tools', () => {
		assert.strictEqual(buildExploreToolStartWire('bash', { description: 'x' }), undefined);
	});

	test('buildExploreToolFinishWire extracts report', () => {
		const wire = buildExploreToolFinishWire('task', {
			subagent_type: 'explore',
			report: 'Auth lives in src/auth.ts',
		}, false);
		assert.deepStrictEqual(wire, {
			exploreReport: 'Auth lives in src/auth.ts',
			exploreError: undefined,
			exploreThoroughness: undefined,
		});
	});

	test('buildExploreToolFinishWire surfaces errors', () => {
		const wire = buildExploreToolFinishWire('task', 'Sub-agents disabled', true);
		assert.deepStrictEqual(wire, { exploreError: 'Sub-agents disabled' });
	});
});
