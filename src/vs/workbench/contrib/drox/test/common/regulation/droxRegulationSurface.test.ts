/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { droxRegulationSurfacePath } from '../../../common/regulation/droxRegulationPaths.js';
import { buildDroxRegulationRunSignals } from '../../../common/regulation/droxRegulationRunSignals.js';
import { DroxRegulationService } from '../../../common/regulation/droxRegulationService.js';
import {
	parseDroxRegulationSurfaceFile,
	serializeDroxRegulationSurfaceFile,
	withLeverModule,
} from '../../../common/regulation/droxRegulationSurfaceStore.js';
import { createDefaultRegulationSurfaceState } from '../../../common/regulation/droxRegulationTypes.js';

suite('Drox regulation R5 surface', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('module pick forces manual mode', () => {
		let state = createDefaultRegulationSurfaceState();
		state = { ...state, L1: { lever: 'L1', mode: 'auto', module: 'standard' } };
		const next = withLeverModule(state, 'L1', 'compact');
		assert.ok(next);
		assert.strictEqual(next!.L1.mode, 'manual');
		assert.strictEqual(next!.L1.module, 'compact');
		assert.strictEqual(withLeverModule(state, 'L1', 'nope' as never), undefined);
	});

	test('serialize/parse surface round-trip', () => {
		const state = createDefaultRegulationSurfaceState();
		const raw = serializeDroxRegulationSurfaceFile({
			...state,
			L2: { lever: 'L2', mode: 'auto', module: 'core' },
		});
		const parsed = parseDroxRegulationSurfaceFile(raw);
		assert.strictEqual(parsed.L2.mode, 'auto');
		assert.strictEqual(parsed.L2.module, 'core');
		assert.strictEqual(parsed.L1.module, 'standard');
	});

	test('service persists surface.json', async () => {
		const log = new NullLogService();
		const fileService = store.add(new FileService(log));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const ws = '/ws-surface';
		const svc = store.add(new DroxRegulationService(fileService, log));
		await svc.ensureHistoryLoaded(ws);
		svc.setLeverModule('L3', 'assertive');
		svc.setLeverMode('L5', 'auto');
		await svc.whenHistoryIdle();
		assert.strictEqual(await fileService.exists(URI.file(droxRegulationSurfacePath(ws))), true);

		const svc2 = store.add(new DroxRegulationService(fileService, log));
		await svc2.ensureHistoryLoaded(ws);
		assert.strictEqual(svc2.getModule('L3'), 'assertive');
		assert.strictEqual(svc2.getState().L3.mode, 'manual');
		assert.strictEqual(svc2.getState().L5.mode, 'auto');
	});

	test('R11 Auto policy retargets auto levers after recordRun', () => {
		const log = new NullLogService();
		const fileService = store.add(new FileService(log));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const svc = store.add(new DroxRegulationService(fileService, log));
		svc.setLeverMode('L2', 'auto');
		svc.setLeverMode('L3', 'manual');
		svc.setLeverModule('L3', 'guided');
		svc.recordRunSignals('ollama::qwen', buildDroxRegulationRunSignals({
			status: 'error',
			error: 'loop detected: repeated tool call',
			engineTrace: [{
				kind: 'run_summary',
				schemaErrorContinueCount: 3,
				textToolMarkerStreak: 2,
			}],
		}));
		assert.strictEqual(svc.getModule('L2'), 'core');
		assert.strictEqual(svc.getState().L2.mode, 'auto');
		assert.strictEqual(svc.getModule('L3'), 'guided');
		assert.strictEqual(svc.getState().L3.mode, 'manual');
	});
});
