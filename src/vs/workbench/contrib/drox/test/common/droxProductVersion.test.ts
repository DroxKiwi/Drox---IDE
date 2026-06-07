/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import {
	formatDroxChatVersionLabel,
	formatDroxChatVersionTitle,
	getDroxEngineDevBuildFromProduct,
	resolveDroxEngineDevBuild,
} from '../../common/droxProductVersion.js';

suite('droxProductVersion', () => {
	test('formatDroxChatVersionLabel prefers compiled engine build', () => {
		assert.strictEqual(
			formatDroxChatVersionLabel({ droxVersion: '1.3.2', version: '1.122.0', droxEngineDevBuild: 27 }, 482901),
			'1.3.2.482901',
		);
	});

	test('formatDroxChatVersionLabel falls back to package.json', () => {
		assert.strictEqual(
			formatDroxChatVersionLabel({ droxVersion: '1.3.2', version: '1.122.0', droxEngineDevBuild: 27 }),
			'1.3.2.27',
		);
	});

	test('formatDroxChatVersionLabel without dev build', () => {
		assert.strictEqual(
			formatDroxChatVersionLabel({ droxVersion: '1.3.1', version: '1.122.0' }),
			'1.3.1',
		);
	});

	test('getDroxEngineDevBuildFromProduct rejects invalid', () => {
		assert.strictEqual(getDroxEngineDevBuildFromProduct({ droxEngineDevBuild: -1 }), undefined);
		assert.strictEqual(getDroxEngineDevBuildFromProduct({ droxEngineDevBuild: NaN }), undefined);
	});

	test('resolveDroxEngineDevBuild prefers engine', () => {
		assert.strictEqual(resolveDroxEngineDevBuild({ droxEngineDevBuild: 27 }, 99), 99);
		assert.strictEqual(resolveDroxEngineDevBuild({ droxEngineDevBuild: 27 }), 27);
	});

	test('formatDroxChatVersionTitle mentions rust stamp when from engine', () => {
		const t = formatDroxChatVersionTitle({ droxVersion: '1.3.2', version: '1.122.0' }, 482901);
		assert.ok(t.includes('482901'));
		assert.ok(t.includes('drox.exe'));
	});
});
