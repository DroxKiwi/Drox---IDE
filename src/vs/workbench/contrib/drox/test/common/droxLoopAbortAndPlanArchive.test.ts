/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	formatDroxAgentsLoopAbortMessage,
	getDroxLoopAbortErrorMessage,
	isDroxLoopDetectedError,
} from '../../common/droxLoopAbort.js';
import {
	consumeDroxPlanArchiveSystemNote,
	markDroxPlanArchivedForNextRun,
	resetDroxPlanArchiveNotesForTest,
} from '../../common/droxPlanArchiveNote.js';

suite('Drox — loop abort + plan archive note', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		resetDroxPlanArchiveNotesForTest();
	});

	test('isDroxLoopDetectedError', () => {
		assert.ok(isDroxLoopDetectedError('Loop detected: both'));
		assert.ok(isDroxLoopDetectedError('agent aborted: loop detected'));
		assert.ok(!isDroxLoopDetectedError('permission denied'));
		assert.ok(!isDroxLoopDetectedError(undefined));
	});

	test('formatDroxAgentsLoopAbortMessage rewrites loop, keeps other errors', () => {
		const loop = formatDroxAgentsLoopAbortMessage('Loop detected: both');
		assert.ok(loop.includes(getDroxLoopAbortErrorMessage()) || /unresolved loop/i.test(loop));
		assert.ok(!loop.includes('Loop detected: both'));
		assert.strictEqual(formatDroxAgentsLoopAbortMessage('boom'), 'boom');
	});

	test('plan archive note is one-shot per session', () => {
		assert.strictEqual(consumeDroxPlanArchiveSystemNote('ses_a'), undefined);
		markDroxPlanArchivedForNextRun('ses_a');
		const note = consumeDroxPlanArchiveSystemNote('ses_a');
		assert.ok(note && /todo plan was archived/i.test(note));
		assert.strictEqual(consumeDroxPlanArchiveSystemNote('ses_a'), undefined);
	});
});
