/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/* eslint-disable local/code-import-patterns, local/code-layering -- Drox agents window bootstrap */

/**
 * Bootstrap moteur Drox dans la fenetre Agents (workbench `vs/sessions/`).
 * Meme stack singletons / handler / modeles que l'IDE principal.
 */

import { registerDroxActions } from '../../../../workbench/contrib/drox/browser/droxActions.js';
import { registerDroxCoreSingletons } from '../../../../workbench/contrib/drox/electron-browser/droxCoreSingletons.js';

registerDroxCoreSingletons();
registerDroxActions();

import '../../../../workbench/contrib/drox/electron-browser/droxEngineConfigContribution.js';
import '../../../../workbench/contrib/drox/electron-browser/droxEngineWarmStartContribution.js';
import '../../../../workbench/contrib/drox/electron-browser/droxEngineWorkbenchContribution.js';
import '../../../../workbench/contrib/drox/electron-browser/droxLlmModelsContribution.js';
import '../../../../workbench/contrib/drox/browser/agents/droxAgentsComposerDroxChatHost.js';
import '../../../../workbench/contrib/drox/browser/agents/droxAgentsChatContribution.js';
import '../../../../workbench/contrib/drox/browser/droxAgentsRetroThemeContribution.js';
import './droxSessionsActiveSessionSync.js';
import './droxSessionsRecencyStorageSync.js';
