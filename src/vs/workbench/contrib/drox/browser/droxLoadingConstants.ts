/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Délai anti-flash unifié pour tous les indicateurs de chargement Drox (ms). */
export const DROX_LOADING_SHOW_DELAY_MS = 450;

/** Timeout max pour `acquireOrLoadSession` (overlay IDE) — évite un « Loading session… » permanent. */
export const DROX_SESSION_LOAD_TIMEOUT_MS = 15_000;

/** Attente max du dossier workspace avant de créer une session native au cold start. */
export const DROX_NATIVE_WORKSPACE_READY_TIMEOUT_MS = 5_000;
