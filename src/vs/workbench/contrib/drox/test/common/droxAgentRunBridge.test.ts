/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import {
	cancelDroxAgentRun,
	IDroxAgentRunBridgeDeps,
	initializeDroxEngineForAgentRun,
	startDroxAgentRun,
} from '../../common/droxAgentRunBridge.js';
import { IDroxClientToolsService } from '../../common/droxClientToolsService.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';

function createBridgeDeps(overrides: {
	initialize?: (opts?: unknown) => Promise<void>;
	request?: (method: string, params?: unknown) => Promise<unknown>;
	filterExecutableTools?: (names: readonly string[]) => string[];
	buildAgentRunParams?: IDroxRunSettingsService['buildAgentRunParams'];
	regulationService?: IDroxAgentRunBridgeDeps['regulationService'];
} = {}): IDroxAgentRunBridgeDeps {
	const requests: { method: string; params?: unknown }[] = [];
	const clientToolsService = {
		executableToolNames: ['grep', 'file_read'],
	} as unknown as IDroxClientToolsService;
	const runSettingsService = {
		filterExecutableTools: overrides.filterExecutableTools ?? (names => [...names]),
		buildAgentRunParams: overrides.buildAgentRunParams ?? (opts => ({
			prompt: opts.prompt,
			workspace: opts.workspace,
			mode: opts.mode,
			sessionId: opts.sessionId,
		})),
	} as unknown as IDroxRunSettingsService;
	const droxEngineService = {
		initialize: overrides.initialize ?? (async (_opts?: unknown) => { }),
		request: overrides.request ?? (async (method: string, params?: unknown) => {
			requests.push({ method, params });
			if (method === 'agent.run') {
				return { runId: 'run_test_1' };
			}
			return {};
		}),
	} as unknown as IDroxEngineService;
	const logService = {
		info: () => { },
		warn: () => { },
	} as unknown as ILogService;
	return {
		clientToolsService,
		runSettingsService,
		droxEngineService,
		logService,
		regulationService: overrides.regulationService,
		_requests: requests,
	} as IDroxAgentRunBridgeDeps & { _requests: { method: string; params?: unknown }[] };
}

suite('Drox — droxAgentRunBridge', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('initializeDroxEngineForAgentRun wires executable tools', async () => {
		let initArgs: unknown;
		const deps = createBridgeDeps({
			initialize: async (opts?: unknown) => { initArgs = opts; },
			filterExecutableTools: names => names.filter(n => n !== 'grep'),
		});
		await initializeDroxEngineForAgentRun(deps);
		assert.deepStrictEqual(initArgs, {
			executableTools: ['file_read'],
			interactiveAsk: true,
		});
	});

	test('startDroxAgentRun returns runId and calls agent.run', async () => {
		const deps = createBridgeDeps() as IDroxAgentRunBridgeDeps & { _requests: { method: string; params?: unknown }[] };
		const runId = await startDroxAgentRun(deps, {
			prompt: '  hello  ',
			workspace: 'C:/ws',
			mode: 'imNotCrazy',
			sessionId: 'ses_abc',
		});
		assert.strictEqual(runId, 'run_test_1');
		const runCall = deps._requests.find(r => r.method === 'agent.run');
		assert.ok(runCall);
		assert.strictEqual((runCall!.params as { prompt?: string }).prompt, '  hello  ');
	});

	test('startDroxAgentRun injects one-shot plan archive system note', async () => {
		const { markDroxPlanArchivedForNextRun, resetDroxPlanArchiveNotesForTest } = await import('../../common/droxPlanArchiveNote.js');
		resetDroxPlanArchiveNotesForTest();
		markDroxPlanArchivedForNextRun('ses_archive');
		let capturedSystem: string | undefined;
		const deps = createBridgeDeps({
			buildAgentRunParams: opts => {
				capturedSystem = opts.system;
				return {
					prompt: opts.prompt,
					workspace: opts.workspace,
					mode: opts.mode,
					sessionId: opts.sessionId,
					system: opts.system,
				};
			},
		});
		await startDroxAgentRun(deps, {
			prompt: 'next',
			workspace: 'C:/ws',
			mode: 'imNotCrazy',
			sessionId: 'ses_archive',
			system: 'existing notes',
		});
		assert.ok(capturedSystem && /todo plan was archived/i.test(capturedSystem));
		assert.ok(capturedSystem!.includes('existing notes'));
		// second run: consumed
		capturedSystem = undefined;
		await startDroxAgentRun(deps, {
			prompt: 'again',
			workspace: 'C:/ws',
			mode: 'imNotCrazy',
			sessionId: 'ses_archive',
			system: 'existing notes',
		});
		assert.strictEqual(capturedSystem, 'existing notes');
	});

	test('startDroxAgentRun omits session notes when L1 is minimal', async () => {
		let capturedSystem: string | undefined;
		const deps = createBridgeDeps({
			buildAgentRunParams: opts => {
				capturedSystem = opts.system;
				return {
					prompt: opts.prompt,
					workspace: opts.workspace,
					mode: opts.mode,
					sessionId: opts.sessionId,
					system: opts.system,
				};
			},
			regulationService: {
				getModule: lever => (lever === 'L1' ? 'minimal' : lever === 'L3' ? 'laissez-faire' : lever === 'L4' ? 'soft' : 'standard'),
			},
		});
		await startDroxAgentRun(deps, {
			prompt: 'hi',
			workspace: 'C:/ws',
			mode: 'imNotCrazy',
			sessionId: 'ses_l1',
			system: 'session notes body',
		});
		assert.strictEqual(capturedSystem, undefined);
	});

	test('startDroxAgentRun injects assertive L3 directive into system', async () => {
		let capturedSystem: string | undefined;
		const deps = createBridgeDeps({
			buildAgentRunParams: opts => {
				capturedSystem = opts.system;
				return {
					prompt: opts.prompt,
					workspace: opts.workspace,
					mode: opts.mode,
					sessionId: opts.sessionId,
					system: opts.system,
				};
			},
			regulationService: {
				getModule: lever => (lever === 'L3' ? 'assertive' : lever === 'L4' ? 'soft' : 'standard'),
			},
		});
		await startDroxAgentRun(deps, {
			prompt: 'hi',
			workspace: 'C:/ws',
			mode: 'imNotCrazy',
			sessionId: 'ses_l3',
			system: 'notes',
		});
		assert.ok(capturedSystem && /Anti-rumination/i.test(capturedSystem));
		assert.ok(capturedSystem!.includes('notes'));
	});

	test('startDroxAgentRun injects strict L4 protocol into system', async () => {
		let capturedSystem: string | undefined;
		const deps = createBridgeDeps({
			buildAgentRunParams: opts => {
				capturedSystem = opts.system;
				return {
					prompt: opts.prompt,
					workspace: opts.workspace,
					mode: opts.mode,
					sessionId: opts.sessionId,
					system: opts.system,
				};
			},
			regulationService: {
				getModule: lever => (lever === 'L4' ? 'strict' : lever === 'L3' ? 'laissez-faire' : 'standard'),
			},
		});
		await startDroxAgentRun(deps, {
			prompt: 'hi',
			workspace: 'C:/ws',
			mode: 'imNotCrazy',
			sessionId: 'ses_l4',
			system: 'notes',
		});
		assert.ok(capturedSystem && /Strict protocol/i.test(capturedSystem));
		assert.ok(capturedSystem!.includes('notes'));
	});

	test('startDroxAgentRun disables non-core tools when L2 is core', async () => {
		const deps = createBridgeDeps({
			buildAgentRunParams: opts => ({
				prompt: opts.prompt,
				workspace: opts.workspace,
				mode: opts.mode,
				sessionId: opts.sessionId,
			}),
			regulationService: {
				getModule: lever => (lever === 'L2' ? 'core' : 'standard'),
			},
		}) as IDroxAgentRunBridgeDeps & { _requests: { method: string; params?: unknown }[] };
		await startDroxAgentRun(deps, {
			prompt: 'hi',
			workspace: 'C:/ws',
			mode: 'imNotCrazy',
			sessionId: 'ses_l2',
		});
		const runCall = deps._requests.find(r => r.method === 'agent.run');
		assert.ok(runCall);
		const disabled = (runCall!.params as { disabledTools?: string[] }).disabledTools;
		assert.ok(disabled);
		assert.ok(disabled!.includes('web_search'));
		assert.ok(!disabled!.includes('bash'));
	});

	test('startDroxAgentRun returns undefined when engine omits runId', async () => {
		const deps = createBridgeDeps({
			request: async method => (method === 'agent.run' ? {} : {}),
		});
		const runId = await startDroxAgentRun(deps, {
			prompt: 'hi',
			workspace: 'C:/ws',
			mode: 'analyze',
			sessionId: 'ses_x',
		});
		assert.strictEqual(runId, undefined);
	});

	test('cancelDroxAgentRun calls agent.cancel', async () => {
		const calls: string[] = [];
		const deps = createBridgeDeps({
			request: async method => {
				calls.push(method);
				return {};
			},
		});
		await cancelDroxAgentRun(deps, 'run_cancel_me');
		assert.deepStrictEqual(calls, ['agent.cancel']);
	});
});
