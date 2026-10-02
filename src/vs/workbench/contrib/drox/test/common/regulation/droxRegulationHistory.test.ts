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
import {
	droxRegulationPromptExcerptFromMessages,
	parseDroxRegulationHistoryFile,
	serializeDroxRegulationHistoryFile,
} from '../../../common/regulation/droxRegulationHistoryStore.js';
import { buildDroxRegulationRunSignals } from '../../../common/regulation/droxRegulationRunSignals.js';
import { droxRegulationHistoryPath } from '../../../common/regulation/droxRegulationPaths.js';
import { DroxRegulationService } from '../../../common/regulation/droxRegulationService.js';
import { DROX_REGULATION_DEFAULT_MODULES } from '../../../common/regulation/droxRegulationTypes.js';

suite('Drox regulation R2 history', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('serialize/parse round-trip', () => {
		const raw = serializeDroxRegulationHistoryFile([{
			id: 'reg_1',
			at: 1,
			promptExcerpt: 'fix login',
			modelKey: 'ollama::qwen',
			modules: { ...DROX_REGULATION_DEFAULT_MODULES },
			leverScores: { L1: 90, L2: 80, L3: 70, L4: 85, L5: 75 },
			globalScore: 80,
			issue: 'ok',
		}]);
		const parsed = parseDroxRegulationHistoryFile(raw);
		assert.strictEqual(parsed.entries.length, 1);
		assert.strictEqual(parsed.entries[0].promptExcerpt, 'fix login');
		assert.strictEqual(parsed.entries[0].issue, 'ok');
	});

	test('prompt excerpt takes last user text', () => {
		const excerpt = droxRegulationPromptExcerptFromMessages([
			{ role: 'user', content: [{ type: 'text', text: 'first' }] },
			{ role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
			{ role: 'user', content: [{ type: 'text', text: '  second prompt  ' }] },
		]);
		assert.strictEqual(excerpt, 'second prompt');
	});

	test('recordRun persists history.json and reloads', async () => {
		const log = new NullLogService();
		const fileService = store.add(new FileService(log));
		const provider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.file, provider));
		const ws = '/ws-reg';
		const svc = store.add(new DroxRegulationService(fileService, log));
		svc.recordRun({
			modelKey: 'ollama::qwen',
			signals: buildDroxRegulationRunSignals({ status: 'completed' }),
			promptExcerpt: 'add button',
			workspaceRootFsPath: ws,
			sessionId: 'ses_1',
			runId: 'run_1',
		});
		await svc.whenHistoryIdle();
		assert.strictEqual(svc.list().length, 1);
		assert.strictEqual(await fileService.exists(URI.file(droxRegulationHistoryPath(ws))), true);

		const svc2 = store.add(new DroxRegulationService(fileService, log));
		await svc2.ensureHistoryLoaded(ws);
		const rows = svc2.list({ modelKey: 'ollama::qwen' });
		assert.strictEqual(rows.length, 1);
		assert.strictEqual(rows[0].promptExcerpt, 'add button');
		assert.strictEqual(rows[0].issue, 'ok');
	});
});
