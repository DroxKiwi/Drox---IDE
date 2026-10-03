/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { buildDroxCodebaseRootAlerts } from '../../../common/codebase/supervision/droxCodebaseRootAlerts.js';

suite('DroxCodebaseRootAlerts', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('no root', () => {
		const alerts = buildDroxCodebaseRootAlerts({ hasRoot: false, manifest: undefined });
		assert.strictEqual(alerts[0]?.code, 'NO_WORKSPACE_ROOT');
	});

	test('no index yet', () => {
		const alerts = buildDroxCodebaseRootAlerts({ hasRoot: true, manifest: undefined });
		assert.strictEqual(alerts[0]?.code, 'NO_INDEX');
	});

	test('empty workspace after index', () => {
		const alerts = buildDroxCodebaseRootAlerts({ hasRoot: true, manifest: { files: 0 } });
		assert.strictEqual(alerts[0]?.code, 'EMPTY_WORKSPACE');
		assert.strictEqual(alerts[0]?.severity, 'warn');
	});

	test('populated index has no root alert', () => {
		const alerts = buildDroxCodebaseRootAlerts({ hasRoot: true, manifest: { files: 3 } });
		assert.strictEqual(alerts.length, 0);
	});
});
