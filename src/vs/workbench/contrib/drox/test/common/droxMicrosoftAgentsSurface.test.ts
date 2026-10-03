/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import {
	DroxHideMicrosoftChatSurfaceContextKey,
	isDroxMicrosoftAgentsSurfaceEnabled,
	shouldHideDroxMicrosoftChatSurface,
} from '../../common/droxMicrosoftAgentsSurface.js';

suite('DroxMicrosoftAgentsSurface', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('product flag false hides Microsoft Chat surface', () => {
		assert.strictEqual(isDroxMicrosoftAgentsSurfaceEnabled({ droxMicrosoftAgentsSurfaceEnabled: false }), false);
		assert.strictEqual(shouldHideDroxMicrosoftChatSurface({ droxMicrosoftAgentsSurfaceEnabled: false }), true);
	});

	test('product flag true keeps Microsoft Chat surface', () => {
		assert.strictEqual(isDroxMicrosoftAgentsSurfaceEnabled({ droxMicrosoftAgentsSurfaceEnabled: true }), true);
		assert.strictEqual(shouldHideDroxMicrosoftChatSurface({ droxMicrosoftAgentsSurfaceEnabled: true }), false);
	});

	test('undefined product flag hides Microsoft Chat surface', () => {
		assert.strictEqual(shouldHideDroxMicrosoftChatSurface({}), true);
	});

	test('context key id is stable for chat when clauses', () => {
		assert.strictEqual(DroxHideMicrosoftChatSurfaceContextKey.key, 'droxHideMicrosoftChatSurface');
	});
});
