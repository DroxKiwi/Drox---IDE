/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import {
	readDroxArchitectModelForContext,
	readDroxChatConfigurationString,
	readDroxChatConfigurationValue,
} from '../../common/droxAgentsConfiguration.js';
import { DroxSetting } from '../../common/droxConfiguration.js';

function mockConfig(inspect: Record<string, { userValue?: unknown; workspaceValue?: unknown; defaultValue?: unknown }>, workspaceValues: Record<string, unknown> = {}): IConfigurationService {
	return {
		inspect: <T>(key: string, opts?: { resource?: URI }) => {
			const entry = inspect[key];
			if (!entry) {
				return undefined;
			}
			return {
				userValue: entry.userValue as T | undefined,
				userLocalValue: undefined,
				userRemoteValue: undefined,
				workspaceValue: opts?.resource ? (entry.workspaceValue as T | undefined) : (entry.workspaceValue as T | undefined),
				defaultValue: entry.defaultValue as T | undefined,
			};
		},
		getValue: <T>(key: string, opts?: { resource?: URI }) => {
			if (opts?.resource && workspaceValues[key] !== undefined) {
				return workspaceValues[key] as T;
			}
			const entry = inspect[key];
			return (entry?.userValue ?? entry?.defaultValue) as T;
		},
	} as unknown as IConfigurationService;
}

suite('droxAgentsConfiguration', () => {
	const ws = URI.file('/tmp/ws');

	test('readDroxChatConfigurationValue prefers USER over workspace fallback', () => {
		const config = mockConfig(
			{ [DroxSetting.Server]: { userValue: 'http://user:11434', defaultValue: '' } },
			{ [DroxSetting.Server]: 'http://workspace:11434' },
		);
		assert.strictEqual(readDroxChatConfigurationString(config, DroxSetting.Server, ws), 'http://user:11434');
	});

	test('readDroxChatConfigurationValue falls back to workspace when USER unset', () => {
		const config = mockConfig(
			{ [DroxSetting.Server]: { defaultValue: '' } },
			{ [DroxSetting.Server]: 'http://legacy-workspace:11434' },
		);
		assert.strictEqual(readDroxChatConfigurationString(config, DroxSetting.Server, ws), 'http://legacy-workspace:11434');
	});

	test('readDroxArchitectModelForContext prefers USER over workspace override', () => {
		const config = mockConfig({
			[DroxSetting.ArchitectModel]: { userValue: 'global-model', workspaceValue: 'ws-only-model', defaultValue: '' },
			[DroxSetting.Model]: { defaultValue: '' },
		});
		assert.strictEqual(readDroxArchitectModelForContext(config, ws), 'global-model');
	});

	test('readDroxArchitectModelForContext falls back to workspace when USER unset', () => {
		const config = mockConfig({
			[DroxSetting.ArchitectModel]: { workspaceValue: 'ws-only-model', defaultValue: '' },
			[DroxSetting.Model]: { defaultValue: '' },
		});
		assert.strictEqual(readDroxArchitectModelForContext(config, ws), 'ws-only-model');
	});

	test('readDroxArchitectModelForContext uses USER when no workspace override', () => {
		const config = mockConfig({
			[DroxSetting.ArchitectModel]: { userValue: 'global-model', defaultValue: '' },
		});
		assert.strictEqual(readDroxArchitectModelForContext(config, ws), 'global-model');
		assert.strictEqual(readDroxChatConfigurationValue<string>(config, DroxSetting.ArchitectModel, ws), 'global-model');
	});
});
