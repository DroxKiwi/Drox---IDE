/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DroxSetting } from './droxConfiguration.js';

export type DroxLlmHeadersMap = Readonly<Record<string, string>>;

export function readLlmHeadersMap(
	configService: IConfigurationService,
	resource?: URI,
): Record<string, string> {
	const raw = configService.getValue<unknown>(DroxSetting.LlmHeaders, { resource });
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return {};
	}
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		const name = String(key).trim();
		if (!name || value === undefined || value === null) {
			continue;
		}
		const v = String(value).trim();
		if (v) {
			out[name] = v;
		}
	}
	return out;
}

/** Fusionne `apiKey` → `x-api-key` si absent, puis les headers personnalisés. */
export function mergeLlmHttpHeaders(apiKey: string, custom: DroxLlmHeadersMap): Record<string, string> {
	const out: Record<string, string> = { ...custom };
	const key = apiKey.trim();
	if (key && !out['x-api-key'] && !out['X-Api-Key']) {
		out['x-api-key'] = key;
	}
	return out;
}

export function llmHeadersForRpc(apiKey: string, custom: DroxLlmHeadersMap): Record<string, string> | undefined {
	const merged = mergeLlmHttpHeaders(apiKey, custom);
	return Object.keys(merged).length > 0 ? merged : undefined;
}
