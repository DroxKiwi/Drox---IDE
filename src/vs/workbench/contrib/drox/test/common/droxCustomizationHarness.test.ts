/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AICustomizationManagementSection } from '../../../chat/common/aiCustomizationWorkspaceService.js';
import { matchesInstructionFileFilter } from '../../../chat/common/customizationHarnessService.js';
import { PromptsType } from '../../../chat/common/promptSyntax/promptTypes.js';
import { DROX_CHAT_SESSION_TYPE } from '../../common/droxAgentsSession.js';
import { createDroxHarnessDescriptor, getDroxUserRoots } from '../../../../../sessions/contrib/providers/drox/browser/droxCustomizationHarness.js';

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

	test('instruction filter recognizes Drox memory files', () => {
		const filter = createDroxHarnessDescriptor(userHome).instructionFileFilter!;
		assert.ok(matchesInstructionFileFilter('/project/DROX.md', filter));
		assert.ok(matchesInstructionFileFilter('/project/MEMORY.md', filter));
		assert.ok(matchesInstructionFileFilter('/project/.drox/rules/style.instructions.md', filter));
		assert.ok(!matchesInstructionFileFilter('/project/AGENTS.md', filter));
	});

	test('storage filter scopes user roots to ~/.drox', () => {
		const descriptor = createDroxHarnessDescriptor(userHome);
		const skillsFilter = descriptor.getStorageSourceFilter(PromptsType.skill);
		assert.deepStrictEqual(getDroxUserRoots(userHome), skillsFilter.includedUserFileRoots);
		assert.ok(!skillsFilter.sources?.includes('plugin'));
	});
});
