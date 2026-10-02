/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mergeRegulationRunIntoSnapshot } from '../../../common/regulation/droxRegulationScoreAggregate.js';
import {
	buildDroxRegulationRunSignals,
	extractDroxRegulationRunIssue,
} from '../../../common/regulation/droxRegulationRunSignals.js';
import {
	scoreRegulationGlobal,
	scoreRegulationRun,
} from '../../../common/regulation/droxRegulationScorer.js';
import { DroxRegulationService } from '../../../common/regulation/droxRegulationService.js';

suite('Drox regulation R1 scorer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const cleanSignals = buildDroxRegulationRunSignals({ status: 'completed' });

	test('clean run scores high on all levers', () => {
		const run = scoreRegulationRun(cleanSignals);
		assert.ok(run.L1 >= 95);
		assert.ok(run.L2 >= 95);
		assert.ok(scoreRegulationGlobal(run) >= 90);
	});

	test('loop error tanks L2 and lowers global', () => {
		const err = 'loop detected: repeated tool call';
		assert.strictEqual(extractDroxRegulationRunIssue('error', err), 'loop');
		const signals = buildDroxRegulationRunSignals({ status: 'error', error: err });
		const run = scoreRegulationRun(signals);
		assert.ok(run.L2 < 70);
	});

	test('schema retries and heavy context penalize L1', () => {
		const signals = buildDroxRegulationRunSignals({
			status: 'completed',
			engineTrace: [{
				kind: 'run_summary',
				schemaErrorContinueCount: 2,
				textToolMarkerStreak: 1,
			}],
			uiStats: { totalIn: 1, totalOut: 1, ctx: 50_000 },
		});
		const run = scoreRegulationRun(signals);
		assert.ok(run.L1 < 60);
	});

	test('service aggregates running mean after two runs', () => {
		const svc = new DroxRegulationService();
		const key = 'ollama::qwen';
		svc.recordRunSignals(key, cleanSignals);
		svc.recordRunSignals(key, buildDroxRegulationRunSignals({
			status: 'error',
			error: 'loop detected: x',
		}));
		const snap = svc.getScores(key);
		assert.strictEqual(snap.samples, 2);
		assert.ok(snap.globalScore < 95);
		assert.ok(snap.globalScore > 40);
		const merged = mergeRegulationRunIntoSnapshot(undefined, key, scoreRegulationRun(cleanSignals));
		assert.strictEqual(merged.samples, 1);
		svc.dispose();
	});
});
