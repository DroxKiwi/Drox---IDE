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
	deriveExploreTitle,
} from '../../../common/chat/droxExploreToolWire.js';

suite('Drox — Explore tool wire', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('buildExploreToolStartWire extracts title, description, thoroughness and return kinds', () => {
		const wire = buildExploreToolStartWire('task', {
			title: 'Find auth entry points',
			description: 'Locate where auth is wired in the IDE and engine.\nReturn paths + symbols.',
			thoroughness: 'medium',
			subagent_type: 'explore',
			return_kinds: ['paths_read', 'key_symbols', 'paths'],
		});
		assert.deepStrictEqual(wire, {
			exploreTitle: 'Find auth entry points',
			exploreDescription: 'Locate where auth is wired in the IDE and engine.\nReturn paths + symbols.',
			exploreThoroughness: 'medium',
			exploreSubagentType: 'explore',
			exploreReturnKinds: ['paths_read', 'key_symbols'],
		});
	});

	test('deriveExploreTitle falls back to first description line', () => {
		assert.strictEqual(
			deriveExploreTitle(undefined, 'Map pedagogy docs\n\nGoal: inventory markdown under docs/pedagogie'),
			'Map pedagogy docs',
		);
	});

	test('deriveExploreTitle rejects meta parrot titles', () => {
		assert.strictEqual(
			deriveExploreTitle(
				'Mission double, très approfondie. Le sub-agent ne voit PAS ce chat — tout le contexte est ici.',
				'Goal: Map docs/pedagogie\n\nList markdown files and H1/H2 titles.',
			),
			'Map docs/pedagogie',
		);
	});

	test('deriveExploreTitle skips meta first line of description', () => {
		assert.strictEqual(
			deriveExploreTitle(
				undefined,
				'Mission double, très approfondie. Le sub-agent ne voit PAS ce chat — tout le contexte est ici.\nCONTEXTE : workspace Next.js\nObjectif : cartographier docs/pedagogie',
			),
			'cartographier docs/pedagogie',
		);
	});

	test('buildExploreSubagentToolSpecificData uses short title + full prompt', () => {
		const data = buildExploreSubagentToolSpecificData(
			{
				exploreTitle: 'Find alert config',
				exploreDescription: 'Search droxConfiguration for traffic alerts.\nReturn the setting keys.',
				exploreThoroughness: 'quick',
			},
			{
				exploreReport: 'Alerts live in droxConfiguration.',
				exploreReportPath: '.drox/subagents/run_1/x-explore/conclusion.md',
			},
		);
		assert.deepStrictEqual(data, {
			kind: 'subagent',
			agentName: 'explore',
			description: 'Find alert config',
			prompt: 'Search droxConfiguration for traffic alerts.\nReturn the setting keys.',
			result: 'Alerts live in droxConfiguration.',
			resultPath: '.drox/subagents/run_1/x-explore/conclusion.md',
		});
	});

	test('buildExploreToolStartWire ignores non-task tools', () => {
		assert.strictEqual(buildExploreToolStartWire('bash', { description: 'x' }), undefined);
	});

	test('buildExploreToolFinishWire extracts report and return kinds', () => {
		const wire = buildExploreToolFinishWire('task', {
			subagent_type: 'explore',
			explore_id: 'exp_1',
			report: 'Auth lives in src/auth.ts',
			report_path: '.drox/subagents/run_1/x-explore/conclusion.md',
			summary: 'Auth lives in src/auth.ts',
			return_kinds: ['paths_read', 'gaps'],
			kinds_incomplete: ['gaps'],
		}, false);
		assert.deepStrictEqual(wire, {
			exploreReport: 'Auth lives in src/auth.ts',
			exploreReportPath: '.drox/subagents/run_1/x-explore/conclusion.md',
			exploreError: undefined,
			exploreThoroughness: undefined,
			exploreSubagentType: 'explore',
			exploreReturnKinds: ['paths_read', 'gaps'],
			exploreId: 'exp_1',
			exploreKindsIncomplete: ['gaps'],
		});
	});

	test('buildExploreToolFinishWire surfaces errors', () => {
		const wire = buildExploreToolFinishWire('task', 'Sub-agents disabled', true);
		assert.deepStrictEqual(wire, { exploreError: 'Sub-agents disabled' });
	});
});
