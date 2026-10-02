/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { DroxRegulationService } from '../../../common/regulation/droxRegulationService.js';
import {
	createDefaultRegulationSurfaceState,
	DROX_REGULATION_DEFAULT_MODULES,
	DROX_REGULATION_LEVER_IDS,
	DROX_REGULATION_MODULES_FOR_LEVER,
	droxRegulationModelKey,
} from '../../../common/regulation/droxRegulationTypes.js';

suite('Drox regulation R0', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('lever ids and default modules are complete', () => {
		assert.deepStrictEqual([...DROX_REGULATION_LEVER_IDS], ['L1', 'L2', 'L3', 'L4', 'L5']);
		for (const lever of DROX_REGULATION_LEVER_IDS) {
			const mod = DROX_REGULATION_DEFAULT_MODULES[lever];
			assert.ok((DROX_REGULATION_MODULES_FOR_LEVER[lever] as readonly string[]).includes(mod));
		}
	});

	test('modelKey normalizes provider and model', () => {
		assert.strictEqual(droxRegulationModelKey(' Ollama ', 'qwen2.5'), 'ollama::qwen2.5');
	});

	test('service returns defaults and empty history', () => {
		const log = new NullLogService();
		const fileService = store.add(new FileService(log));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const svc = store.add(new DroxRegulationService(fileService, log));
		const state = createDefaultRegulationSurfaceState();
		assert.strictEqual(svc.getModule('L1'), state.L1.module);
		assert.strictEqual(svc.getModule('L2'), 'standard');
		const scores = svc.getScores('ollama::test');
		assert.strictEqual(scores.samples, 0);
		assert.strictEqual(scores.globalScore, 50);
		assert.strictEqual(svc.list().length, 0);
	});
});
