/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IDroxCodebaseIndexService } from '../../../common/codebase/droxCodebaseIndexService.js';
import { DroxCodebaseAutoIndex } from '../../../common/codebase/supervision/droxCodebaseAutoIndex.js';
import { createEmptyCodebaseSnapshot, IDroxCodebaseCockpitSnapshot } from '../../../common/codebase/droxCodebaseTypes.js';

suite('droxCodebaseAutoIndex coalesce', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('coalesces to latest root while a job is in flight', async () => {
		const rootA = URI.file('/ws/a');
		const rootB = URI.file('/ws/b');
		const rootC = URI.file('/ws/c');
		let active = rootA;
		const ensured: string[] = [];

		let releaseFirst!: () => void;
		const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
		let resolveSecond!: () => void;
		const secondDone = new Promise<void>(resolve => { resolveSecond = resolve; });
		let firstEntered = false;

		const indexService = {
			async ensureIndexed(root: URI): Promise<void> {
				ensured.push(root.fsPath);
				if (!firstEntered) {
					firstEntered = true;
					await firstGate;
					return;
				}
				resolveSecond();
			},
		} as unknown as IDroxCodebaseIndexService;

		let snapshot: IDroxCodebaseCockpitSnapshot = createEmptyCodebaseSnapshot();
		const auto = new DroxCodebaseAutoIndex(
			indexService,
			{ warn: () => { } } as never,
			() => active,
			() => snapshot,
			s => { snapshot = s; },
			() => { },
			async () => { },
		);

		auto.schedule('active-root');
		// Microtask: first job must have entered ensureIndexed.
		for (let i = 0; i < 5 && !firstEntered; i++) {
			await Promise.resolve();
		}
		assert.strictEqual(firstEntered, true);
		assert.strictEqual(auto.inFlight, true);
		assert.deepStrictEqual(ensured, [rootA.fsPath]);

		active = rootB;
		auto.schedule('active-root');
		active = rootC;
		auto.schedule('active-root');
		assert.strictEqual(auto.pendingRootFsPath, rootC.fsPath);

		releaseFirst();
		await secondDone;
		// Allow the loop to clear inFlight.
		for (let i = 0; i < 5 && auto.inFlight; i++) {
			await Promise.resolve();
		}

		assert.strictEqual(auto.inFlight, false);
		assert.strictEqual(auto.pendingRootFsPath, undefined);
		assert.deepStrictEqual(ensured, [rootA.fsPath, rootC.fsPath]);
	});

	test('paused snapshot skips schedule', () => {
		const root = URI.file('/ws/a');
		const ensured: string[] = [];
		const indexService = {
			async ensureIndexed(r: URI): Promise<void> {
				ensured.push(r.fsPath);
			},
		} as unknown as IDroxCodebaseIndexService;

		let snapshot: IDroxCodebaseCockpitSnapshot = { ...createEmptyCodebaseSnapshot(root.fsPath), state: 'paused' };
		const auto = new DroxCodebaseAutoIndex(
			indexService,
			{ warn: () => { } } as never,
			() => root,
			() => snapshot,
			s => { snapshot = s; },
			() => { },
			async () => { },
		);

		auto.schedule('startup');
		assert.strictEqual(auto.inFlight, false);
		assert.deepStrictEqual(ensured, []);
	});

	test('paused on another root does not block schedule', async () => {
		const root = URI.file('/ws/b');
		const ensured: string[] = [];
		const indexService = {
			async ensureIndexed(r: URI): Promise<void> {
				ensured.push(r.fsPath);
			},
		} as unknown as IDroxCodebaseIndexService;

		let snapshot: IDroxCodebaseCockpitSnapshot = { ...createEmptyCodebaseSnapshot('/ws/a'), state: 'paused' };
		const auto = new DroxCodebaseAutoIndex(
			indexService,
			{ warn: () => { } } as never,
			() => root,
			() => snapshot,
			s => { snapshot = s; },
			() => { },
			async () => { },
		);

		auto.schedule('active-root');
		for (let i = 0; i < 5 && ensured.length === 0; i++) {
			await Promise.resolve();
		}
		assert.deepStrictEqual(ensured, [root.fsPath]);
	});
});
