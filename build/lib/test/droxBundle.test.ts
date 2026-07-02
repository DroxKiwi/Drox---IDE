/*---------------------------------------------------------------------------------------------
 *  Copyright (c) KDDS. Drox IDE fork — tests for Drox packaging helpers.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'node:test';
import { getDroxCopilotExtensionPackagingExclusions, shouldBundleDroxCopilotExtension } from '../droxBundle.ts';

suite('droxBundle', () => {
	test('excludes copilot extension from packaging when Microsoft agents surface is off', () => {
		if (shouldBundleDroxCopilotExtension()) {
			assert.deepStrictEqual(getDroxCopilotExtensionPackagingExclusions(), []);
		} else {
			assert.deepStrictEqual(getDroxCopilotExtensionPackagingExclusions(), [
				'!.build/extensions/copilot',
				'!.build/extensions/copilot/**',
			]);
		}
	});
});
