/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { droxLlmSnapshotDiffersFromConfiguration } from '../../common/droxChatConfigSync.js';
import { DroxSetting } from '../../common/droxConfiguration.js';

function mockConfig(inspect: Record<string, { userValue?: unknown; defaultValue?: unknown }>): IConfigurationService {
	return {
		inspect: <T>(key: string) => {
			const entry = inspect[key];
			if (!entry) {
				return undefined;
			}
			return {
				userValue: entry.userValue as T | undefined,
				userLocalValue: undefined,
				userRemoteValue: undefined,
				workspaceValue: undefined,
				defaultValue: entry.defaultValue as T | undefined,
			};
		},
		getValue: <T>(key: string) => {
			const entry = inspect[key];
			return (entry?.userValue ?? entry?.defaultValue) as T;
		},
	} as unknown as IConfigurationService;
}

suite('droxChatConfigSync', () => {
	const ws = URI.file('/tmp/ws');

	test('droxLlmSnapshotDiffersFromConfiguration detects server and model drift', () => {
		const config = mockConfig({
			[DroxSetting.Server]: { userValue: 'http://new:11434', defaultValue: '' },
			[DroxSetting.LlmProvider]: { userValue: 'ollama', defaultValue: 'ollama' },
			[DroxSetting.ArchitectModel]: { userValue: 'model-b', defaultValue: '' },
			[DroxSetting.Model]: { defaultValue: '' },
		});
		const snapshot = { provider: 'ollama' as const, server: 'http://old:11434', selected: 'model-a' };
		assert.strictEqual(droxLlmSnapshotDiffersFromConfiguration(snapshot, config, ws), true);
	});

	test('droxLlmSnapshotDiffersFromConfiguration false when aligned', () => {
		const config = mockConfig({
			[DroxSetting.Server]: { userValue: 'http://host:11434', defaultValue: '' },
			[DroxSetting.LlmProvider]: { userValue: 'ollama', defaultValue: 'ollama' },
			[DroxSetting.ArchitectModel]: { userValue: 'model-a', defaultValue: '' },
			[DroxSetting.Model]: { defaultValue: '' },
		});
		const snapshot = { provider: 'ollama' as const, server: 'http://host:11434', selected: 'model-a' };
		assert.strictEqual(droxLlmSnapshotDiffersFromConfiguration(snapshot, config, ws), false);
	});
});
