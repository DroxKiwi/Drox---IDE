/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file
import { localize } from '../../../../nls.js';
import { ConfigurationScope, IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';
import { DroxSetting } from './droxConfiguration.js';
const TUNING_CUSTOM_ONLY = localize(
	'drox.engine.tuning.customOnly',
	'*(Effective only when **Engine strictness** is `custom` — ignored for relaxed, normal, and strict presets.)*',
);
function appendTuningCustomOnly(markdownDescription: string): string {
	return `${markdownDescription}\n\n${TUNING_CUSTOM_ONLY}`;
}
/**
 * `drox.engine.tuning.*` schemas — product-oriented descriptions (English).
 * Default values come from engine presets (`EngineTuning::from_preset`).
 */
export function createDroxEngineTuningConfigurationProperties(): Record<string, IConfigurationPropertySchema> {
	const properties: Record<string, IConfigurationPropertySchema> = {
		[DroxSetting.EngineTuningReadBudgetPercent]: {
			type: 'number',
			default: 70,
			minimum: 5,
			maximum: 100,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.readBudgetPercent',
				'**Read budget (Discussion prompt)** — suggested percentage of the repo to explore in system text before answering directly. Higher = broader read guidance in the prompt only; does not set a hard tool quota by itself.',
			)),
		},
		[DroxSetting.EngineTuningPromotableAnswerMinChars]: {
			type: 'number',
			default: 60,
			minimum: 1,
			maximum: 500,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.promotableAnswerMinChars',
				'**Close without extra turn (Architect / Action)** — minimum assistant text length to accept `[phase: done]` after `[phase: answering]` without another LLM turn. Avoids empty “done” markers.',
			)),
		},
		[DroxSetting.EngineTuningDiscussionPromotableMinChars]: {
			type: 'number',
			default: 8,
			minimum: 1,
			maximum: 200,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.discussionPromotableMinChars',
				'**Discussion close threshold** — same rule as above, but lower bar (greetings, short replies).',
			)),
		},
		[DroxSetting.EngineTuningDiscussionAutoStopOnReply]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.discussionAutoStopOnReply',
				'**Discussion auto-stop** — when enabled, ends the run as soon as a sufficient user-facing reply is produced (length ≥ Discussion threshold), without extra turns.',
			)),
		},
		[DroxSetting.EngineTuningIntentMaxIterations]: {
			type: 'number',
			default: 2,
			minimum: 1,
			maximum: 3,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.intentMaxIterations',
				'**Auto gate turns** — maximum LLM turns for the intent probe (`[gate: architect_discuss|architect_edit]`) at the start of a message in **Auto** architect mode.',
			)),
		},
		[DroxSetting.EngineTuningDiscussionMaxIterations]: {
			type: 'number',
			default: 20,
			minimum: 1,
			maximum: 25,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.discussionMaxIterations',
				'**Discussion max turns** — agent loop cap when architect mode is **Discussion** (light read tools only).',
			)),
		},
		[DroxSetting.EngineTuningLoopStrikesBeforeAbort]: {
			type: 'number',
			default: 4,
			minimum: 1,
			maximum: 5,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.loopStrikesBeforeAbort',
				'**Anti-loop** — consecutive **identical** LLM turns (same text and/or same tool calls) allowed before abort. Each repeat injects a recenter message into the transcript; above the cap: `LoopDetected`.',
			)),
		},
		[DroxSetting.EngineTuningMaxToolsPerTurnArchitect]: {
			type: 'number',
			default: 6,
			minimum: 0,
			maximum: 16,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.maxToolsPerTurnArchitect',
				'**Tools per turn (Architect)** — maximum tool calls in a single Architect LLM turn. `0` = no tools on that turn.',
			)),
		},
		[DroxSetting.EngineTuningMaxToolsPerTurnDiscussion]: {
			type: 'number',
			default: 4,
			minimum: 0,
			maximum: 16,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.maxToolsPerTurnDiscussion',
				'**Tools per turn (Discussion)** — same limit for Discussion role (light read-only tools allowed).',
			)),
		},
		[DroxSetting.EngineTuningMaxConsecutiveAskUserFailures]: {
			type: 'number',
			default: 3,
			minimum: 1,
			maximum: 10,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.maxConsecutiveAskUserFailures',
				'**`ask_user_question` failures** — after N consecutive failed asks, injects a nudge to ask in Markdown or fix the tool JSON.',
			)),
		},
		[DroxSetting.EngineTuningMaxToolsPerTurnIntent]: {
			type: 'number',
			default: 0,
			minimum: 0,
			maximum: 4,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.maxToolsPerTurnIntent',
				'**Tools per turn (Auto gate)** — tools allowed during the intent probe. `0` = text only (expected for discuss vs edit routing).',
			)),
		},
		[DroxSetting.EngineTuningMaxParallelToolCalls]: {
			type: 'number',
			default: 8,
			minimum: 1,
			maximum: 32,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.maxParallelToolCalls',
				'**Parallel tool calls** — maximum tools executed in parallel within one turn (e.g. multiple `grep` at once).',
			)),
		},
		[DroxSetting.EngineTuningMaxTodoItems]: {
			type: 'number',
			default: 0,
			minimum: 0,
			maximum: 64,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.maxTodoItems',
				'**Plan size** — maximum `todo_write` items. `0` = no engine cap.',
			)),
		},
		[DroxSetting.EngineTuningMemoryBudgetTokens]: {
			type: 'number',
			default: 0,
			minimum: 0,
			maximum: 200_000,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.memoryBudgetTokens',
				'**Long-term memory budget** — token cap for `memory_*` tools. `0` = unlimited on the engine side.',
			)),
		},
		[DroxSetting.EngineTuningLiveCompactTailKeepMessages]: {
			type: 'number',
			default: 4,
			minimum: 1,
			maximum: 16,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.liveCompactTailKeepMessages',
				'**Live compaction — recent tail** — number of recent messages kept verbatim during automatic context compaction.',
			)),
		},
		[DroxSetting.EngineTuningLiveCompactMaxTailRatio]: {
			type: 'number',
			default: 0.2,
			minimum: 0.05,
			maximum: 0.5,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.liveCompactMaxTailRatio',
				'**Live compaction — tail ratio** — maximum fraction of history treated as “recent tail” before compaction triggers.',
			)),
		},
		[DroxSetting.EngineTuningLiveCompactMinPrefixTokens]: {
			type: 'number',
			default: 3000,
			minimum: 500,
			maximum: 20_000,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.liveCompactMinPrefixTokens',
				'**Live compaction — token threshold** — minimum prefix tokens to summarize before live compaction runs.',
			)),
		},
		[DroxSetting.EngineTuningLiveCompactMaxPasses]: {
			type: 'number',
			default: 3,
			minimum: 1,
			maximum: 5,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.liveCompactMaxPasses',
				'**Compaction passes** — maximum successive summarization passes on one session.',
			)),
		},
		[DroxSetting.EngineTuningCheckpointMaxChars]: {
			type: 'number',
			default: 3000,
			minimum: 500,
			maximum: 10_000,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.checkpointMaxChars',
				'**Injected checkpoint** — maximum characters of synthesis block injected into the prompt (cycle anchor / manual compaction).',
			)),
		},
		[DroxSetting.EngineTuningAnchorUserRequestMaxChars]: {
			type: 'number',
			default: 900,
			minimum: 200,
			maximum: 4000,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.anchorUserRequestMaxChars',
				'**User request anchor** — characters kept from the first user message in architect state (reminder late in the cycle).',
			)),
		},
		[DroxSetting.EngineTuningAnchorPlanMaxItems]: {
			type: 'number',
			default: 24,
			minimum: 4,
			maximum: 64,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.anchorPlanMaxItems',
				'**Plan anchor** — maximum `todo_write` lines shown in plan reminders (checkpoint / cycle).',
			)),
		},
		[DroxSetting.EngineTuningSummarizeToolResultTruncate]: {
			type: 'number',
			default: 500,
			minimum: 80,
			maximum: 2000,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.summarizeToolResultTruncate',
				'**Truncate — compaction summary** — max characters per tool result when building a session summary.',
			)),
		},
		[DroxSetting.EngineTuningReinjectToolResultTruncate]: {
			type: 'number',
			default: 1200,
			minimum: 200,
			maximum: 4000,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.reinjectToolResultTruncate',
				'**Truncate — reinjection** — max characters for tool results re-injected into history after compaction.',
			)),
		},
		[DroxSetting.EngineTuningContextSnipEnabled]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.contextSnipEnabled',
				'**Context snip** — when enabled, the engine may emit context reduction when history exceeds budget (updates **ctx** gauge in chat).',
			)),
		},
		[DroxSetting.EngineTuningGateDoneRequiresAnswering]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.gateDoneRequiresAnswering',
				'**Gate L1 — done after answering** — requires `[phase: answering]` (visible reply) before accepting `[phase: done]`.',
			)),
		},
		[DroxSetting.EngineTuningGateTestingAfterCodeMutation]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.gateTestingAfterCodeMutation',
				'**Gate L2 — testing after mutation** — after `file_edit` / `bash` / …, nudge or gate to use `[phase: testing]` before closing.',
			)),
		},
		[DroxSetting.EngineTuningGateTodoRecreationBlocked]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.gateTodoRecreationBlocked',
				'**Gate L3 — no new plan** — blocks recreating a full `todo_write` list once all work items are `completed`.',
			)),
		},
		[DroxSetting.EngineTuningGateTodoStaleBeforeDone]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.RESOURCE,
			markdownDescription: appendTuningCustomOnly(localize(
				'drox.engine.tuning.gateTodoStaleBeforeDone',
				'**Gate L5 — plan in sync** — blocks `[phase: done]` if `todo_write` still has stale `pending` / `in_progress` items.',
			)),
		},
	};
	return properties;
}
