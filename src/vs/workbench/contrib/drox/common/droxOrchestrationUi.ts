/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * 1.3.4 — masque la vignette Executor et les réglages délégation dans l'IDE.
 * Le moteur conserve le code exécuteur (`executor_delegation_enabled` côté engine).
 *
 * Clés en littéraux (pas d'import `DroxSetting`) pour éviter une dépendance circulaire
 * avec `droxConfiguration.ts` au chargement du workbench.
 */
export const DROX_EXECUTOR_DELEGATION_UI_ENABLED = false;

export function isExecutorDelegationUiEnabled(): boolean {
	return DROX_EXECUTOR_DELEGATION_UI_ENABLED;
}

/** Réglages racine Drox liés aux sub-agents / exécuteur. */
export const DROX_EXECUTOR_DELEGATION_TOP_LEVEL_SETTINGS: readonly string[] = [
	'drox.executor.model',
	'drox.orchestration.maxParallelExecutors',
	'drox.subagents.enabled',
	'drox.subagents.model',
	'drox.subagents.maxIterations',
	'drox.subagents.maxConcurrent',
	'drox.subagents.numCtx',
];

/** `drox.engine.tuning.*` liés à `delegate_executor` / exécuteur. */
export const DROX_EXECUTOR_DELEGATION_TUNING_SETTINGS: readonly string[] = [
	'drox.engine.tuning.maxReadsBeforeDelegate',
	'drox.engine.tuning.maxMutationsBeforeDelegateNudge',
	'drox.engine.tuning.minDelegateInstructionsLen',
	'drox.engine.tuning.maxDelegateScopePaths',
	'drox.engine.tuning.delegateScopeMaxFiles',
	'drox.engine.tuning.maxDelegationsPerTask',
	'drox.engine.tuning.maxToolsPerTurnExecutor',
	'drox.engine.tuning.requireDelegateBeforeTodoComplete',
	'drox.engine.tuning.requireWorkspaceMapBeforeDelegate',
	'drox.engine.tuning.minDeliverableBytes',
	'drox.engine.tuning.executorDeliverableExcerptMaxChars',
	'drox.engine.tuning.executorSubrunMaxIterations',
	'drox.engine.tuning.executorGlobHeavyBlocked',
	'drox.engine.tuning.executorAskUserBlocked',
	'drox.engine.tuning.executorTodoWriteBlocked',
	'drox.engine.tuning.executorDeliverableMetBlocked',
];
