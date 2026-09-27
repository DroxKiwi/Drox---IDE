/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { readDroxGeneralSettingsForWebview } from '../../browser/chat/droxChatGeneralSettings.js';
import {
	readDroxRoleModelsForWebview,
	setDroxArchitectLlmParamsFromWebview,
} from '../../browser/chat/droxChatRoleModels.js';
import { DroxSetting, droxConfigurationNode } from '../../common/droxConfiguration.js';
import { DROX_DEFAULT_MAX_ITERATIONS } from '../../common/droxProductDefaults.js';
import {
	buildAgentRunParams,
	IDroxLlmSettings,
	readLlmSettings,
} from '../../common/droxRunSettings.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';

const WS = URI.file('C:/ws');

function createMockConfigurationService(
	values: Record<string, unknown> = {},
): IConfigurationService & { readonly values: Record<string, unknown> } {
	const store = { ...values };
	return {
		values: store,
		getValue: <T>(key: string, _opts?: { resource?: URI }) => store[key] as T,
		updateValue: async (key: string, value: unknown) => {
			store[key] = value;
		},
	} as unknown as IConfigurationService & { readonly values: Record<string, unknown> };
}

function createMockRunSettingsService(
	config: IConfigurationService,
	llmOverrides: Partial<IDroxLlmSettings> = {},
): IDroxRunSettingsService {
	const base: IDroxLlmSettings = {
		server: '',
		model: 'test-model',
		apiKey: '',
		llmHeaders: {},
		llmProvider: 'ollama',
		primaryLanguage: 'fr',
		maxIterations: DROX_DEFAULT_MAX_ITERATIONS,
		temperature: undefined,
		maxTokens: undefined,
		numPredict: undefined,
		numCtx: undefined,
		topP: undefined,
		topK: undefined,
		repeatPenalty: undefined,
		seed: undefined,
		minP: undefined,
		presencePenalty: undefined,
		frequencyPenalty: undefined,
		keepAlive: '',
		nativeThinking: false,
		llmParamsMuted: [],
		...llmOverrides,
	};
	return {
		_serviceBrand: undefined,
		getWorkspaceResource: () => WS,
		getLlmSettings: () => base,
		getEnvOverrides: () => ({}),
		getDisabledToolsForRun: () => [],
		isMcpToolsEnabled: () => true,
		getPermissionMode: () => 'imNotCrazy',
		filterExecutableTools: names => [...names],
		buildAgentRunParams: () => ({}),
	};
}

suite('Drox — M1 config moteur (read + agent.run wire)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('readLlmSettings defaults maxIterations to 50', () => {
		const config = createMockConfigurationService();
		const settings = readLlmSettings(config, WS);
		assert.strictEqual(settings.maxIterations, 50);
		assert.strictEqual(DROX_DEFAULT_MAX_ITERATIONS, 50);
	});

	test('readLlmSettings reads sampling without dev gate', () => {
		const config = createMockConfigurationService({
			[DroxSetting.TopP]: 0.85,
			[DroxSetting.RepeatPenalty]: 1.15,
			[DroxSetting.KeepAlive]: '30m',
			[DroxSetting.MaxIterations]: 37,
		});
		const settings = readLlmSettings(config, WS);
		assert.strictEqual(settings.topP, 0.85);
		assert.strictEqual(settings.repeatPenalty, 1.15);
		assert.strictEqual(settings.keepAlive, '30m');
		assert.strictEqual(settings.maxIterations, 37);
	});

	test('topP and maxIterations flow into next agent.run params', () => {
		const settings = readLlmSettings(createMockConfigurationService({
			[DroxSetting.TopP]: 0.85,
			[DroxSetting.MaxIterations]: 42,
			[DroxSetting.ArchitectModel]: 'qwen3:8b',
		}), WS);
		const params = buildAgentRunParams({
			prompt: 'ping',
			workspace: WS.fsPath,
			mode: 'acceptEdits',
			sessionId: 'ses_m1',
			settings,
			disabledTools: [],
			mcpToolsEnabled: true,
		});
		assert.strictEqual(params.topP, 0.85);
		assert.strictEqual(params.maxIterations, 42);
		assert.strictEqual(params.model, 'qwen3:8b');
		assert.strictEqual(params.orchestrationMode, undefined);
		assert.strictEqual('engineTuning' in params, false);
	});

	test('buildAgentRunParams forwards optional system supplement (session notes N0)', () => {
		const settings = readLlmSettings(createMockConfigurationService({
			[DroxSetting.ArchitectModel]: 'qwen3:8b',
		}), WS);
		const params = buildAgentRunParams({
			prompt: 'ping',
			workspace: WS.fsPath,
			mode: 'acceptEdits',
			sessionId: 'ses_notes',
			settings,
			disabledTools: [],
			mcpToolsEnabled: true,
			system: '  [Session notes]\n---\nBe brief\n---  ',
		});
		assert.strictEqual(params.system, '[Session notes]\n---\nBe brief\n---');
	});

	test('readDroxGeneralSettingsForWebview exposes maxIterations in release path', () => {
		const config = createMockConfigurationService({
			[DroxSetting.MaxIterations]: 42,
			[DroxSetting.Server]: 'http://127.0.0.1:11434',
		});
		const wire = readDroxGeneralSettingsForWebview({
			runSettingsService: createMockRunSettingsService(config),
			configurationService: config,
		});
		assert.strictEqual(wire.maxIterations, 42);
		assert.strictEqual('keepAlive' in wire, false);
		assert.strictEqual('maxTokens' in wire, false);
	});

	test('readDroxRoleModelsForWebview exposes architect sampling for webview', () => {
		const role = readDroxRoleModelsForWebview({
			runSettingsService: createMockRunSettingsService(createMockConfigurationService(), {
				model: 'gemma4:12b',
				topP: 0.9,
				maxTokens: 2048,
				keepAlive: '5m',
			}),
		});
		assert.strictEqual(role.architectModel, 'gemma4:12b');
		assert.strictEqual(role.architectTopP, 0.9);
		assert.strictEqual(role.architectMaxTokens, 2048);
		assert.strictEqual(role.architectKeepAlive, '5m');
	});

	test('setDroxArchitectLlmParamsFromWebview persists topP for next run', async () => {
		const config = createMockConfigurationService();
		await setDroxArchitectLlmParamsFromWebview(
			{ runSettingsService: createMockRunSettingsService(config), configurationService: config },
			{ topP: 0.88, maxTokens: 4096 },
		);
		assert.strictEqual(config.values[DroxSetting.TopP], 0.88);
		assert.strictEqual(config.values[DroxSetting.MaxTokens], 4096);
		const params = buildAgentRunParams({
			prompt: 'after patch',
			workspace: WS.fsPath,
			mode: 'acceptEdits',
			sessionId: 'ses_patch',
			settings: readLlmSettings(config, WS),
			disabledTools: [],
			mcpToolsEnabled: true,
		});
		assert.strictEqual(params.topP, 0.88);
		assert.strictEqual(params.maxTokens, 4096);
	});

	test('Ollama Cloud sends Bearer in headers without duplicate apiKey param', () => {
		const params = buildAgentRunParams({
			prompt: 'ping',
			workspace: WS.fsPath,
			mode: 'acceptEdits',
			sessionId: 'ses_cloud',
			settings: {
				...createMockRunSettingsService(createMockConfigurationService()).getLlmSettings(),
				server: 'https://ollama.com',
				apiKey: 'ollama-cloud-key',
				llmProvider: 'ollama',
			},
			disabledTools: [],
			mcpToolsEnabled: true,
		});
		const headers = params.headers as Record<string, string>;
		assert.strictEqual(headers.Authorization, 'Bearer ollama-cloud-key');
		assert.strictEqual(params.apiKey, undefined);
	});

	test('local self-hosted uses custom headers only, no apiKey RPC param', () => {
		const params = buildAgentRunParams({
			prompt: 'ping',
			workspace: WS.fsPath,
			mode: 'acceptEdits',
			sessionId: 'ses_local',
			settings: {
				...createMockRunSettingsService(createMockConfigurationService()).getLlmSettings(),
				server: 'http://127.0.0.1:11434',
				apiKey: 'legacy-key-should-not-auto-apply',
				llmHeaders: { 'x-api-key': 'my-personal-gateway-key' },
				llmProvider: 'ollama',
			},
			disabledTools: [],
			mcpToolsEnabled: true,
		});
		const headers = params.headers as Record<string, string>;
		assert.strictEqual(headers['x-api-key'], 'my-personal-gateway-key');
		assert.strictEqual(params.apiKey, undefined);
	});

	test('droxConfigurationNode excludes legacy 1.4 settings keys', () => {
		const keys = Object.keys(droxConfigurationNode.properties ?? {}) as string[];
		assert.ok(!keys.includes('drox.architect.interactionMode'));
		assert.ok(!keys.includes('drox.executor.model'));
		assert.ok(!keys.includes('drox.engine.strictness'));
		assert.ok(!keys.some(k => k.startsWith('drox.engine.tuning.')));
		assert.ok(!keys.some(k => k.startsWith('drox.subagents.')));
	});
});
