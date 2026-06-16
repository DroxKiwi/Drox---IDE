/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import {
	formatDroxChatVersionLabel,
	formatDroxChatVersionTitle,
	formatDroxDevBuildEpoch,
	getDroxEngineDevBuildFromProduct,
	resolveDroxEngineDevBuild,
} from '../../common/droxProductVersion.js';

suite('droxProductVersion', () => {
	test('formatDroxChatVersionLabel prefers compiled engine build', () => {
		assert.strictEqual(
			formatDroxChatVersionLabel({ droxVersion: '1.3.2', version: '1.122.0', droxEngineDevBuild: 27 }, 1_749_984_769),
			'1.3.2.1749984769',
		);
	});

	test('formatDroxChatVersionLabel does not fall back to package.json on dev surface', () => {
		assert.strictEqual(
			formatDroxChatVersionLabel({ droxVersion: '1.3.2', version: '1.122.0', droxEngineDevBuild: 27 }),
			'1.3.2',
		);
	});

	test('formatDroxChatVersionLabel without dev build', () => {
		assert.strictEqual(
			formatDroxChatVersionLabel({ droxVersion: '1.3.1', version: '1.122.0' }),
			'1.3.1',
		);
	});

	test('formatDroxChatVersionLabel release surface ignores engine build', () => {
		assert.strictEqual(
			formatDroxChatVersionLabel({ droxVersion: '1.4.0', version: '1.122.0', droxSurface: 'release', droxEngineDevBuild: 27 }, 1_749_984_769),
			'1.4.0',
		);
	});

	test('getDroxEngineDevBuildFromProduct rejects invalid', () => {
		assert.strictEqual(getDroxEngineDevBuildFromProduct({ droxEngineDevBuild: -1 }), undefined);
		assert.strictEqual(getDroxEngineDevBuildFromProduct({ droxEngineDevBuild: NaN }), undefined);
	});

	test('resolveDroxEngineDevBuild prefers engine', () => {
		assert.strictEqual(resolveDroxEngineDevBuild({ droxEngineDevBuild: 27 }, 99), 99);
		assert.strictEqual(resolveDroxEngineDevBuild({ droxVersion: '1.3.2', droxSurface: 'release', droxEngineDevBuild: 27 }), 27);
		assert.strictEqual(resolveDroxEngineDevBuild({ droxEngineDevBuild: 27 }), undefined);
	});

	test('formatDroxDevBuildEpoch formats unix seconds', () => {
		assert.strictEqual(formatDroxDevBuildEpoch(1_749_984_769), '2025-06-15T10:52:49.000Z');
	});

	test('formatDroxChatVersionTitle mentions git and executable when from engine', () => {
		const t = formatDroxChatVersionTitle(
			{ droxVersion: '1.3.2', version: '1.122.0' },
			{ devBuild: 1_749_984_769, gitSha: 'd0beafd', executablePath: 'C:\\drox\\target\\debug\\drox.exe' },
		);
		assert.ok(t.includes('1749984769'));
		assert.ok(t.includes('d0beafd'));
		assert.ok(t.includes('drox.exe'));
	});
});
