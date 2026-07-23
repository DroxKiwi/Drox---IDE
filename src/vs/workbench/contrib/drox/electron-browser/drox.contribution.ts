/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/



import './droxEngineConfigContribution.js';

import './droxEngineWarmStartContribution.js';

import './droxEngineWorkbenchContribution.js';

import './droxLlmModelsContribution.js';

import './droxUpdateService.js';

import './droxUpdateNotificationContribution.js';

import '../browser/agents/droxAgentsChatContribution.js';
import '../browser/chat/droxIdeChat.contribution.js';
import '../browser/gitGraph/droxGitGraph.contribution.js';

import { registerDroxCoreSingletons } from './droxCoreSingletons.js';

import { registerDroxUpdateActions } from './droxUpdateActions.js';



registerDroxUpdateActions();

registerDroxCoreSingletons();

