/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IDroxClientToolsService } from '../common/droxClientToolsService.js';
import { IDroxExecutableService } from '../common/droxExecutableService.js';
import { IDroxEngineService } from '../common/droxEngineService.js';
import { IDroxAttachmentsService } from '../common/droxAttachmentsService.js';
import { IDroxChatSessionService } from '../common/droxChatSessionService.js';
import { IDroxRefsBridgeService } from '../common/droxRefsBridgeService.js';
import { IDroxComposerBridgeService } from '../common/droxComposerBridgeService.js';
import { DroxComposerBridgeService } from '../browser/droxComposerBridgeService.js';
import { IDroxLongMemoryService } from '../common/droxLongMemoryService.js';
import { DroxRefsBridgeService } from '../browser/droxRefsBridgeService.js';
import { IDroxPasteCandidateService } from '../common/droxPasteCandidateService.js';
import { DroxPasteCandidateService } from '../browser/droxPasteCandidateService.js';
import { IDroxSessionCompactService } from '../common/droxSessionCompactService.js';
import { IDroxSessionService } from '../common/droxSessionService.js';
import { IDroxSlashCommandService } from '../common/droxSlashCommandService.js';
import { IDroxRunSettingsService } from '../common/droxRunSettingsService.js';
import { IDroxUserAskService } from '../common/droxUserAskService.js';
import { DroxAttachmentsService } from './droxAttachmentsService.js';
import { DroxChatSessionService } from './droxChatSessionService.js';
import { DroxLongMemoryService } from './droxLongMemoryService.js';
import { DroxSessionCompactService } from './droxSessionCompactService.js';
import { DroxSessionService } from './droxSessionService.js';
import { DroxSlashCommandService } from './droxSlashCommandService.js';
import { DroxClientToolsService } from './droxClientToolsService.js';
import { DroxExecutableService } from './droxExecutableService.js';
import { DroxEngineService } from './droxEngineService.js';
import { DroxRunSettingsService } from './droxRunSettingsService.js';
import { DroxUserAskService } from './droxUserAskService.js';
import { IDroxLlmModelsService } from '../common/droxLlmModelsService.js';
import { IDroxRunRevertService } from '../common/droxRunRevertService.js';
import { DroxRunRevertService } from './droxRunRevertService.js';
import { DroxLlmModelsService } from './droxLlmModelsService.js';
import './droxEngineConfigContribution.js';
import './droxEngineWarmStartContribution.js';
import './droxEngineWorkbenchContribution.js';
import './droxLlmModelsContribution.js';

registerSingleton(IDroxRefsBridgeService, DroxRefsBridgeService, InstantiationType.Eager);
registerSingleton(IDroxComposerBridgeService, DroxComposerBridgeService, InstantiationType.Eager);
registerSingleton(IDroxPasteCandidateService, DroxPasteCandidateService, InstantiationType.Eager);
registerSingleton(IDroxExecutableService, DroxExecutableService, InstantiationType.Delayed);
registerSingleton(IDroxEngineService, DroxEngineService, InstantiationType.Delayed);
registerSingleton(IDroxRunSettingsService, DroxRunSettingsService, InstantiationType.Delayed);
registerSingleton(IDroxClientToolsService, DroxClientToolsService, InstantiationType.Eager);
registerSingleton(IDroxUserAskService, DroxUserAskService, InstantiationType.Eager);
registerSingleton(IDroxAttachmentsService, DroxAttachmentsService, InstantiationType.Delayed);
registerSingleton(IDroxSlashCommandService, DroxSlashCommandService, InstantiationType.Delayed);
registerSingleton(IDroxSessionService, DroxSessionService, InstantiationType.Delayed);
registerSingleton(IDroxChatSessionService, DroxChatSessionService, InstantiationType.Eager);
registerSingleton(IDroxSessionCompactService, DroxSessionCompactService, InstantiationType.Delayed);
registerSingleton(IDroxLongMemoryService, DroxLongMemoryService, InstantiationType.Delayed);
registerSingleton(IDroxLlmModelsService, DroxLlmModelsService, InstantiationType.Eager);
registerSingleton(IDroxRunRevertService, DroxRunRevertService, InstantiationType.Eager);
