/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
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
