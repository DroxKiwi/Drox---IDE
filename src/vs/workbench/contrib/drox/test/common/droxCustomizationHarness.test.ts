/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AICustomizationManagementSection } from '../../../chat/common/aiCustomizationWorkspaceService.js';
import { DROX_CHAT_SESSION_TYPE } from '../../common/droxAgentsSession.js';
import { createDroxHarnessDescriptor } from '../../../../../sessions/contrib/providers/drox/browser/droxCustomizationHarness.js';

suite('DroxCustomizationHarness', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const userHome = URI.file('/home/user');

	test('descriptor id matches Drox session type', () => {
		const descriptor = createDroxHarnessDescriptor(userHome);
		assert.strictEqual(descriptor.id, DROX_CHAT_SESSION_TYPE);
		assert.strictEqual(descriptor.label, 'Drox');
	});

	test('hides Copilot-specific sections', () => {
		const hidden = createDroxHarnessDescriptor(userHome).hiddenSections ?? [];
		assert.ok(hidden.includes(AICustomizationManagementSection.Plugins));
		assert.ok(hidden.includes(AICustomizationManagementSection.Tools));
		assert.ok(hidden.includes(AICustomizationManagementSection.Hooks));
	});
});
