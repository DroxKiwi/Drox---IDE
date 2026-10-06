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
