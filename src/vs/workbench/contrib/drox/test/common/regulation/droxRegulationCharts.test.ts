/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	droxRegulationGlobalScoreSeries,
	droxRegulationIssueBreakdown,
	droxRegulationSparklinePoints,
} from '../../../common/regulation/droxRegulationCharts.js';
import { DROX_REGULATION_DEFAULT_MODULES, IDroxRegulationHistoryEntry } from '../../../common/regulation/droxRegulationTypes.js';

function entry(partial: Partial<IDroxRegulationHistoryEntry> & Pick<IDroxRegulationHistoryEntry, 'id' | 'at' | 'globalScore' | 'issue'>): IDroxRegulationHistoryEntry {
	return {
		promptExcerpt: '',
		modelKey: 'ollama::t',
		modules: { ...DROX_REGULATION_DEFAULT_MODULES },
		leverScores: { L1: 50, L2: 50, L3: 50, L4: 50, L5: 50 },
		...partial,
	};
}

suite('Drox regulation R4 charts', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('global series is chronological and capped', () => {
		const hist = [
			entry({ id: 'b', at: 200, globalScore: 80, issue: 'ok' }),
			entry({ id: 'a', at: 100, globalScore: 40, issue: 'error' }),
			entry({ id: 'c', at: 300, globalScore: 90, issue: 'ok' }),
		];
		assert.deepStrictEqual([...droxRegulationGlobalScoreSeries(hist)], [40, 80, 90]);
		assert.strictEqual(droxRegulationGlobalScoreSeries(hist, 2).length, 2);
		assert.deepStrictEqual([...droxRegulationGlobalScoreSeries(hist, 2)], [80, 90]);
	});

	test('issue breakdown counts', () => {
		const hist = [
			entry({ id: '1', at: 1, globalScore: 90, issue: 'ok' }),
			entry({ id: '2', at: 2, globalScore: 40, issue: 'error' }),
			entry({ id: '3', at: 3, globalScore: 30, issue: 'loop' }),
			entry({ id: '4', at: 4, globalScore: 50, issue: 'cancel' }),
			entry({ id: '5', at: 5, globalScore: 95, issue: 'ok' }),
		];
		const b = droxRegulationIssueBreakdown(hist);
		assert.strictEqual(b.total, 5);
		assert.strictEqual(b.ok, 2);
		assert.strictEqual(b.error, 1);
		assert.strictEqual(b.loop, 1);
		assert.strictEqual(b.cancel, 1);
	});

	test('sparkline points for single and multi', () => {
		assert.ok(droxRegulationSparklinePoints([50], 100, 40).includes(','));
		const multi = droxRegulationSparklinePoints([0, 100], 100, 40);
		assert.ok(multi.split(' ').length === 2);
	});
});
