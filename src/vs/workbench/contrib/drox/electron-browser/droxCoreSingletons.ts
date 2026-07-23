/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { DroxComposerBridgeService } from '../browser/droxComposerBridgeService.js';
import { DroxPasteCandidateService } from '../browser/droxPasteCandidateService.js';
import { DroxRefsBridgeService } from '../browser/droxRefsBridgeService.js';
import { DroxReleaseNotesService } from '../browser/droxReleaseNotesService.js';
import { IDroxAttachmentsService } from '../common/droxAttachmentsService.js';
import { IDroxChatSessionService } from '../common/droxChatSessionService.js';
import { IDroxClientToolsService } from '../common/droxClientToolsService.js';
import { IDroxComposerBridgeService } from '../common/droxComposerBridgeService.js';
import { IDroxEngineService } from '../common/droxEngineService.js';
import { IDroxExecutableService } from '../common/droxExecutableService.js';
import { IDroxLlmModelsService } from '../common/droxLlmModelsService.js';
import { IDroxLongMemoryService } from '../common/droxLongMemoryService.js';
import { IDroxPasteCandidateService } from '../common/droxPasteCandidateService.js';
import { IDroxRefsBridgeService } from '../common/droxRefsBridgeService.js';
import { IDroxReleaseNotesService } from '../common/droxReleaseNotesService.js';
import { IDroxSessionGitService } from '../common/droxSessionGitService.js';
import { IDroxGitGraphService } from '../common/droxGitGraphService.js';
import { IDroxSessionChangesDetailService, DroxSessionChangesDetailService } from '../common/droxSessionChangesDetailService.js';
import { IDroxSessionChangesBridge, DroxSessionChangesBridge } from '../common/droxSessionChangesBridge.js';
import { IDroxSessionChangesPanelService, DroxSessionChangesPanelService } from '../common/droxSessionChangesPanelService.js';
import { IDroxRunRevertService } from '../common/droxRunRevertService.js';
import { IDroxRunSettingsService } from '../common/droxRunSettingsService.js';
import { IDroxSessionCompactService } from '../common/droxSessionCompactService.js';
import { IDroxSessionService } from '../common/droxSessionService.js';
import { IDroxSlashCommandService } from '../common/droxSlashCommandService.js';
import { IDroxUserAskService } from '../common/droxUserAskService.js';
import { DroxAttachmentsService } from './droxAttachmentsService.js';
import { DroxChatSessionService } from './droxChatSessionService.js';
import { DroxClientToolsService } from './droxClientToolsService.js';
import { DroxEngineService } from './droxEngineService.js';
import { DroxExecutableService } from './droxExecutableService.js';
import { DroxLlmModelsService } from './droxLlmModelsService.js';
import { DroxLongMemoryService } from './droxLongMemoryService.js';
import { DroxRunRevertService } from './droxRunRevertService.js';
import { DroxRunSettingsService } from './droxRunSettingsService.js';
import { DroxSessionCompactService } from './droxSessionCompactService.js';
import { DroxSessionService } from './droxSessionService.js';
import { DroxSlashCommandService } from './droxSlashCommandService.js';
import { DroxUserAskService } from './droxUserAskService.js';
import { DroxSessionGitService } from './droxSessionGitService.js';
import { DroxGitGraphService } from './droxGitGraphService.js';

/** Singletons moteur Drox partagés entre l’IDE principal et la fenêtre Agents. */
export function registerDroxCoreSingletons(): void {
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
	registerSingleton(IDroxSessionChangesBridge, DroxSessionChangesBridge, InstantiationType.Eager);
	registerSingleton(IDroxSessionChangesDetailService, DroxSessionChangesDetailService, InstantiationType.Eager);
	registerSingleton(IDroxSessionChangesPanelService, DroxSessionChangesPanelService, InstantiationType.Eager);
	registerSingleton(IDroxReleaseNotesService, DroxReleaseNotesService, InstantiationType.Eager);
	registerSingleton(IDroxSessionGitService, DroxSessionGitService, InstantiationType.Delayed);
	registerSingleton(IDroxGitGraphService, DroxGitGraphService, InstantiationType.Delayed);
}
