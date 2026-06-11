/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { DroxSetting } from './droxConfiguration.js';
import { DroxEngineStrictnessPreset } from './droxEngineStrictness.js';
/** Objet partiel envoyé dans `agent.run` (`engineTuning`). */
export type DroxEngineTuningOverrides = Record<string, number | boolean>;
type RpcFieldKind = 'number' | 'boolean';
interface EngineTuningRpcField {
	readonly rpcKey: string;
	readonly settingKey: string;
	readonly kind: RpcFieldKind;
}
/** Registre wire RPC ↔ settings IDE (solo architecte 1.4.0). */
export const DROX_ENGINE_TUNING_RPC_FIELDS: readonly EngineTuningRpcField[] = [
	{ rpcKey: 'readBudgetPercent', settingKey: DroxSetting.EngineTuningReadBudgetPercent, kind: 'number' },
	{ rpcKey: 'promotableAnswerMinChars', settingKey: DroxSetting.EngineTuningPromotableAnswerMinChars, kind: 'number' },
	{ rpcKey: 'discussionPromotableMinChars', settingKey: DroxSetting.EngineTuningDiscussionPromotableMinChars, kind: 'number' },
	{ rpcKey: 'discussionAutoStopOnReply', settingKey: DroxSetting.EngineTuningDiscussionAutoStopOnReply, kind: 'boolean' },
	{ rpcKey: 'intentMaxIterations', settingKey: DroxSetting.EngineTuningIntentMaxIterations, kind: 'number' },
	{ rpcKey: 'discussionMaxIterations', settingKey: DroxSetting.EngineTuningDiscussionMaxIterations, kind: 'number' },
	{ rpcKey: 'loopStrikesBeforeAbort', settingKey: DroxSetting.EngineTuningLoopStrikesBeforeAbort, kind: 'number' },
	{ rpcKey: 'maxConsecutiveAskUserFailures', settingKey: DroxSetting.EngineTuningMaxConsecutiveAskUserFailures, kind: 'number' },
	{ rpcKey: 'maxToolsPerTurnArchitect', settingKey: DroxSetting.EngineTuningMaxToolsPerTurnArchitect, kind: 'number' },
	{ rpcKey: 'maxToolsPerTurnDiscussion', settingKey: DroxSetting.EngineTuningMaxToolsPerTurnDiscussion, kind: 'number' },
	{ rpcKey: 'maxToolsPerTurnIntent', settingKey: DroxSetting.EngineTuningMaxToolsPerTurnIntent, kind: 'number' },
	{ rpcKey: 'maxParallelToolCalls', settingKey: DroxSetting.EngineTuningMaxParallelToolCalls, kind: 'number' },
	{ rpcKey: 'maxTodoItems', settingKey: DroxSetting.EngineTuningMaxTodoItems, kind: 'number' },
	{ rpcKey: 'memoryBudgetTokens', settingKey: DroxSetting.EngineTuningMemoryBudgetTokens, kind: 'number' },
	{ rpcKey: 'liveCompactTailKeepMessages', settingKey: DroxSetting.EngineTuningLiveCompactTailKeepMessages, kind: 'number' },
	{ rpcKey: 'liveCompactMaxTailRatio', settingKey: DroxSetting.EngineTuningLiveCompactMaxTailRatio, kind: 'number' },
	{ rpcKey: 'liveCompactMinPrefixTokens', settingKey: DroxSetting.EngineTuningLiveCompactMinPrefixTokens, kind: 'number' },
	{ rpcKey: 'liveCompactMaxPasses', settingKey: DroxSetting.EngineTuningLiveCompactMaxPasses, kind: 'number' },
	{ rpcKey: 'checkpointMaxChars', settingKey: DroxSetting.EngineTuningCheckpointMaxChars, kind: 'number' },
	{ rpcKey: 'anchorUserRequestMaxChars', settingKey: DroxSetting.EngineTuningAnchorUserRequestMaxChars, kind: 'number' },
	{ rpcKey: 'anchorPlanMaxItems', settingKey: DroxSetting.EngineTuningAnchorPlanMaxItems, kind: 'number' },
	{ rpcKey: 'summarizeToolResultTruncate', settingKey: DroxSetting.EngineTuningSummarizeToolResultTruncate, kind: 'number' },
	{ rpcKey: 'reinjectToolResultTruncate', settingKey: DroxSetting.EngineTuningReinjectToolResultTruncate, kind: 'number' },
	{ rpcKey: 'contextSnipEnabled', settingKey: DroxSetting.EngineTuningContextSnipEnabled, kind: 'boolean' },
	{ rpcKey: 'gateDoneRequiresAnswering', settingKey: DroxSetting.EngineTuningGateDoneRequiresAnswering, kind: 'boolean' },
	{ rpcKey: 'gateTestingAfterCodeMutation', settingKey: DroxSetting.EngineTuningGateTestingAfterCodeMutation, kind: 'boolean' },
	{ rpcKey: 'gateTodoRecreationBlocked', settingKey: DroxSetting.EngineTuningGateTodoRecreationBlocked, kind: 'boolean' },
	{ rpcKey: 'gateTodoStaleBeforeDone', settingKey: DroxSetting.EngineTuningGateTodoStaleBeforeDone, kind: 'boolean' },
];
function readOptionalNumber(
	configService: IConfigurationService,
	key: string,
	resource?: URI,
): number | undefined {
	const v = configService.getValue<number | undefined>(key, { resource });
	return typeof v === 'number' && !Number.isNaN(v) ? v : undefined;
}
function readOptionalBoolean(
	configService: IConfigurationService,
	key: string,
	resource?: URI,
): boolean | undefined {
	const v = configService.getValue<boolean | undefined>(key, { resource });
	return typeof v === 'boolean' ? v : undefined;
}
/**
 * Lit les clés `drox.engine.tuning.*` et produit l'objet RPC (omis si vide).
 * À n'appeler que lorsque le preset strictness est `custom`.
 */
export function buildEngineTuningOverridesForRpc(
	configService: IConfigurationService,
	resource?: URI,
): DroxEngineTuningOverrides | undefined {
	const out: DroxEngineTuningOverrides = {};
	for (const { rpcKey, settingKey, kind } of DROX_ENGINE_TUNING_RPC_FIELDS) {
		if (kind === 'boolean') {
			const b = readOptionalBoolean(configService, settingKey, resource);
			if (b !== undefined) {
				out[rpcKey] = b;
			}
			continue;
		}
		const n = readOptionalNumber(configService, settingKey, resource);
		if (n === undefined) {
			continue;
		}
		if ((rpcKey === 'maxTodoItems' || rpcKey === 'memoryBudgetTokens') && n <= 0) {
			continue;
		}
		out[rpcKey] = n;
	}
	return Object.keys(out).length > 0 ? out : undefined;
}
export function wireEngineTuningForRpc(
	strictness: DroxEngineStrictnessPreset,
	configService: IConfigurationService,
	resource?: URI,
): DroxEngineTuningOverrides | undefined {
	if (strictness !== 'custom') {
		return undefined;
	}
	return buildEngineTuningOverridesForRpc(configService, resource);
}
