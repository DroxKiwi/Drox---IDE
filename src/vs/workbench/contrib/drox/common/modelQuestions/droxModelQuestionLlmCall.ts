/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buildLlmChatUrl, type DroxLlmProviderId } from '../droxLlmCatalog.js';
import { IDroxModelQuestionVariant } from './droxModelQuestionTypes.js';
import { renderDroxModelQuestionUser } from './droxModelQuestionCatalog.js';

export interface IDroxModelQuestionLlmCallDeps {
	readonly provider: DroxLlmProviderId;
	readonly server: string;
	readonly model: string;
	readonly fetchHttp: (
		url: string,
		headers?: Record<string, string>,
		options?: { method?: 'GET' | 'POST'; body?: string },
	) => Promise<{ statusCode: number; body: string }>;
	readonly headers?: Record<string, string>;
}

/** One-shot chat for a catalog question; returns raw assistant text. */
export async function callDroxModelQuestionLlm(
	deps: IDroxModelQuestionLlmCallDeps,
	variant: IDroxModelQuestionVariant,
	userMessage: string,
): Promise<string | undefined> {
	const target = buildLlmChatUrl(deps.provider, deps.server);
	if ('error' in target || !deps.model.trim()) {
		return undefined;
	}
	const user = renderDroxModelQuestionUser(variant, userMessage);
	const body = deps.provider === 'ollama'
		? JSON.stringify({
			model: deps.model,
			stream: false,
			format: 'json',
			messages: [
				{ role: 'system', content: variant.system },
				{ role: 'user', content: user },
			],
		})
		: JSON.stringify({
			model: deps.model,
			stream: false,
			response_format: { type: 'json_object' },
			messages: [
				{ role: 'system', content: variant.system },
				{ role: 'user', content: user },
			],
		});
	const res = await deps.fetchHttp(target.url, {
		'Content-Type': 'application/json',
		...(deps.headers ?? {}),
	}, { method: 'POST', body });
	if (!res.statusCode || res.statusCode >= 400) {
		return undefined;
	}
	return extractAssistantText(deps.provider, res.body);
}

function extractAssistantText(provider: DroxLlmProviderId, body: string): string | undefined {
	try {
		const json = JSON.parse(body) as Record<string, unknown>;
		if (provider === 'ollama') {
			const msg = json.message as { content?: string } | undefined;
			return typeof msg?.content === 'string' ? msg.content : undefined;
		}
		const choices = json.choices as Array<{ message?: { content?: string } }> | undefined;
		const content = choices?.[0]?.message?.content;
		return typeof content === 'string' ? content : undefined;
	} catch {
		return undefined;
	}
}
