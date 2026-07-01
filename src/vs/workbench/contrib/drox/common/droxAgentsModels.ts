/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../nls.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../chat/common/languageModels.js';
import { DROX_CHAT_SESSION_TYPE } from './droxAgentsSession.js';
import { IDroxLlmModelsSnapshot } from './droxLlmModelsService.js';
import { modelLikelySupportsVision } from './droxVision.js';

export const DROX_AGENTS_LM_VENDOR = 'drox';
export const DROX_AGENTS_EXTENSION = new ExtensionIdentifier('drox.agents');

export function toDroxAgentsModelIdentifier(modelName: string): string {
	return `${DROX_AGENTS_LM_VENDOR}:${modelName}`;
}

export function parseDroxAgentsModelIdentifier(modelId: string): string | undefined {
	return modelId.startsWith(`${DROX_AGENTS_LM_VENDOR}:`) ? modelId.slice(DROX_AGENTS_LM_VENDOR.length + 1) : undefined;
}

/** Modèles d'embedding (Ollama, etc.) — exclus du picker chat agent. */
export function isDroxEmbeddingModelId(modelId: string): boolean {
	return /embed/i.test(modelId);
}

export function droxLlmSnapshotToLanguageModels(
	snap: IDroxLlmModelsSnapshot,
): readonly ILanguageModelChatMetadataAndIdentifier[] {
	const chatModels = snap.models.filter(model => !isDroxEmbeddingModelId(model));
	if (chatModels.length === 0) {
		return [];
	}
	const detail = snap.server
		? localize('droxAgents.modelDetailWithServer', '{0} · {1}', snap.provider, snap.server)
		: localize('droxAgents.localModel', 'Local Drox model');
	return chatModels.map(model => ({
		identifier: toDroxAgentsModelIdentifier(model),
		metadata: {
			extension: DROX_AGENTS_EXTENSION,
			name: model,
			vendor: DROX_AGENTS_LM_VENDOR,
			family: DROX_AGENTS_LM_VENDOR,
			version: '1',
			id: model,
			maxInputTokens: 128_000,
			maxOutputTokens: 32_000,
			isDefaultForLocation: {},
			isUserSelectable: true,
			targetChatSessionType: DROX_CHAT_SESSION_TYPE,
			detail,
			capabilities: {
				vision: modelLikelySupportsVision(model) !== false,
			},
		},
	}));
}
