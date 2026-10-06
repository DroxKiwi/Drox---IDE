/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import {
	createDroxBashStdoutMarker,
	extractStdoutAfterDroxBashMarker,
	wrapDroxBashCommandWithMarker,
} from '../../common/droxBash.js';
import { droxBashShouldRevealTerminal } from '../../common/droxBashVisibleTerminal.js';

suite('Drox bash visible terminal heuristic', () => {

	test('one-shot inspect commands stay hidden', () => {
		assert.strictEqual(droxBashShouldRevealTerminal('git status'), false);
		assert.strictEqual(droxBashShouldRevealTerminal('docker ps -a'), false);
		assert.strictEqual(droxBashShouldRevealTerminal('dir'), false);
		assert.strictEqual(droxBashShouldRevealTerminal('npm test'), false);
	});

	test('dev servers / watchers are revealed', () => {
		assert.strictEqual(droxBashShouldRevealTerminal('npm run dev'), true);
		assert.strictEqual(droxBashShouldRevealTerminal('pnpm start'), true);
		assert.strictEqual(droxBashShouldRevealTerminal('npx vite'), true);
		assert.strictEqual(droxBashShouldRevealTerminal('next dev'), true);
		assert.strictEqual(droxBashShouldRevealTerminal('docker compose up'), true);
		assert.strictEqual(droxBashShouldRevealTerminal('uvicorn app:main --reload'), true);
		assert.strictEqual(droxBashShouldRevealTerminal('nodemon src/index.js'), true);
	});

	test('detached compose stays hidden', () => {
		assert.strictEqual(droxBashShouldRevealTerminal('docker compose up -d'), false);
	});
});

suite('Drox bash stdout marker (P0)', () => {
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
