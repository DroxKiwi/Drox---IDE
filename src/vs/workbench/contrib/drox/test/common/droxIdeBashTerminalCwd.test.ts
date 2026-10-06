/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	createDroxBashStdoutMarker,
	extractStdoutAfterDroxBashMarker,
	sanitizeDroxAgentTerminalCwd,
	wrapDroxBashCommandWithMarker,
} from '../../common/droxBash.js';

suite('Drox agent terminal cwd sanitize', () => {
	test('strips extended-length prefix', () => {
		assert.strictEqual(
			sanitizeDroxAgentTerminalCwd('\\\\?\\C:\\Users\\coren\\proj'),
			'C:\\Users\\coren\\proj',
		);
	});

	test('normalizes \\?\\UNC\\ to UNC', () => {
		assert.strictEqual(
			sanitizeDroxAgentTerminalCwd('\\\\?\\UNC\\server\\share\\docs'),
			'\\\\server\\share\\docs',
		);
	});

	test('leaves normal paths', () => {
		assert.strictEqual(
			sanitizeDroxAgentTerminalCwd('C:\\Users\\coren\\proj'),
			'C:\\Users\\coren\\proj',
		);
		assert.strictEqual(sanitizeDroxAgentTerminalCwd(undefined), undefined);
		assert.strictEqual(sanitizeDroxAgentTerminalCwd('  '), undefined);
	});
});

suite('Drox agent terminal stdout marker', () => {
	test('wraps cmd and posix', () => {
		const m = '__DROX_BASH_test__';
		assert.strictEqual(
			wrapDroxBashCommandWithMarker('git status', m, true),
			`echo ${m}& git status`,
		);
		assert.strictEqual(
			wrapDroxBashCommandWithMarker('git status', m, false),
			`printf '%s\\n' '${m}'; git status`,
		);
	});

	test('extracts after marker and refuses stale buffer', () => {
		const m = createDroxBashStdoutMarker();
		assert.ok(m.startsWith('__DROX_BASH_'));
		assert.strictEqual(
			extractStdoutAfterDroxBashMarker(`stale\n${m}\nhello\nworld`, m),
			'hello\nworld',
		);
		assert.strictEqual(extractStdoutAfterDroxBashMarker('only stale scrollback', m), '');
	});
});
