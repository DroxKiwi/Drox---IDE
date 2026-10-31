/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Défaut agent quand `drox.maxIterations` est absent des settings workspace. */
export const DROX_DEFAULT_MAX_ITERATIONS = 50;
/** Plafond settings / UI pour `drox.maxIterations` (gros plans multi-fichiers). */
export const DROX_MAX_ITERATIONS_CAP = 1000;
/** Défaut Explore (`drox.subagents.maxIterations`) — pas de plafond UI. */
export const DROX_DEFAULT_SUBAGENTS_MAX_ITERATIONS = 25;
export const DROX_DEFAULT_NUM_CTX = 32_768;
export const DROX_DEFAULT_NUM_PREDICT = 4096;

/** Échantillonnage par défaut du panneau modèle (reset inclus). */
export const DROX_DEFAULT_TEMPERATURE = 0.2;
export const DROX_DEFAULT_TOP_P = 0.9;
export const DROX_DEFAULT_TOP_K = 40;
export const DROX_DEFAULT_REPEAT_PENALTY = 1;
export const DROX_DEFAULT_MIN_P = 0;
export const DROX_DEFAULT_SEED = 42;
export const DROX_DEFAULT_PRESENCE_PENALTY = 0;
export const DROX_DEFAULT_FREQUENCY_PENALTY = 0;
export const DROX_DEFAULT_MAX_TOKENS = 8192;
export const DROX_DEFAULT_KEEP_ALIVE = '5m';
export const DROX_DEFAULT_REASONING_EFFORT = 'low';
export const DROX_DEFAULT_THINKING_BUDGET = 4096;
