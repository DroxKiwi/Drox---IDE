/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { formatDroxRulesAnnex } from '../../../common/rules/droxRulesFormat.js';
import { parseDroxRuleMarkdown } from '../../../common/rules/droxRulesParse.js';
import { droxRuleShouldAutoInject, selectDroxRulesForRun } from '../../../common/rules/droxRulesSelect.js';
import { IDroxRule } from '../../../common/rules/droxRulesTypes.js';

suite('Drox — project rules (auto-inject)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parse supports Cursor alwaysApply + globs and VS Code applyTo', () => {
		const rule = parseDroxRuleMarkdown(`---
description: Arbo n+1
alwaysApply: true
globs: "**/*.rs"
---
# Body
Split files.
`, { id: 'arbo', relativePath: '.drox/rules/arbo.mdc' });
		assert.ok(rule);
		assert.strictEqual(rule!.alwaysApply, true);
		assert.deepStrictEqual(rule!.applyTo, ['**/*.rs']);
		assert.ok(rule!.body.includes('Split files'));
	});

	test('no frontmatter → alwaysApply', () => {
		const rule = parseDroxRuleMarkdown('Always on rule body', {
			id: 'plain',
			relativePath: '.drox/rules/plain.md',
		});
		assert.ok(rule?.alwaysApply);
	});

	test('select: always / universal / scoped / on-demand', () => {
		const always: IDroxRule = {
			id: 'a', relativePath: 'a.md', description: undefined, alwaysApply: true, applyTo: [], body: 'A',
		};
		const universal: IDroxRule = {
			id: 'u', relativePath: 'u.md', description: undefined, alwaysApply: false, applyTo: ['**'], body: 'U',
		};
		const scoped: IDroxRule = {
			id: 's', relativePath: 's.md', description: undefined, alwaysApply: false, applyTo: ['**/*.rs'], body: 'S',
		};
		const onDemand: IDroxRule = {
			id: 'o', relativePath: 'o.md', description: undefined, alwaysApply: false, applyTo: [], body: 'O',
		};

		assert.ok(droxRuleShouldAutoInject(always));
		assert.ok(droxRuleShouldAutoInject(universal));
		assert.ok(!droxRuleShouldAutoInject(scoped));
		assert.ok(droxRuleShouldAutoInject(scoped, { contextPaths: ['src/foo.rs'] }));
		assert.ok(!droxRuleShouldAutoInject(onDemand));

		const selected = selectDroxRulesForRun([always, universal, scoped, onDemand], {
			contextPaths: ['src/foo.rs'],
		});
		assert.deepStrictEqual(selected.map(r => r.id).sort(), ['a', 's', 'u']);
	});

	test('format annex respects budget', () => {
		const rules: IDroxRule[] = [
			{ id: '1', relativePath: '1.md', description: 'One', alwaysApply: true, applyTo: [], body: 'AAA' },
			{ id: '2', relativePath: '2.md', description: 'Two', alwaysApply: true, applyTo: [], body: 'BBB'.repeat(200) },
		];
		const annex = formatDroxRulesAnnex(rules, { maxChars: 180 });
		assert.ok(annex);
		assert.ok(annex!.ruleCount >= 1);
		assert.ok(annex!.text.includes('Project rules'));
		assert.ok(annex!.chars <= 220);
	});
});
