/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../chat/common/languageModels.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import {
	persistDroxArchitectModelUser,
	isDroxNativeChatStackEnabled,
	readDroxArchitectModelUser,
} from '../../common/droxAgentsConfiguration.js';
import { DROX_CHAT_SESSION_TYPE } from '../../common/droxAgentsSession.js';
import { isDroxEmbeddingModelId, parseDroxAgentsModelIdentifier, toDroxAgentsModelIdentifier } from '../../common/droxAgentsModels.js';
import { DroxAgentsComposerToolbar } from './droxAgentsComposerToolbar.js';
import { createDroxAgentsChatStatusBarHost, DroxAgentsChatStatusBarHost } from './droxAgentsChatStatusBar.js';

export { createDroxAgentsChatStatusBarHost, DroxAgentsChatStatusBarHost };

export function isDroxAgentsChatSessionType(sessionType: string | undefined): boolean {
	return sessionType === DROX_CHAT_SESSION_TYPE;
}

export function syncDroxArchitectModelFromChatPicker(
	configurationService: IConfigurationService,
	workspaceService: IWorkspaceContextService,
	modelIdentifier: string,
): void {
	if (!isDroxNativeChatStackEnabled(configurationService)) {
		return;
	}
	const bare = parseDroxAgentsModelIdentifier(modelIdentifier);
	if (!bare || isDroxEmbeddingModelId(bare)) {
		return;
	}
	const architect = readDroxArchitectModelUser(configurationService);
	if (architect === bare) {
		return;
	}
	const workspaceResource = workspaceService.getWorkspace().folders[0]?.uri;
	void persistDroxArchitectModelUser(configurationService, bare, workspaceResource);
}

export function findDroxArchitectLanguageModel(
	models: readonly ILanguageModelChatMetadataAndIdentifier[],
	configurationService: IConfigurationService,
	_workspaceService: IWorkspaceContextService,
): ILanguageModelChatMetadataAndIdentifier | undefined {
	const architect = readDroxArchitectModelUser(configurationService);
	if (!architect || isDroxEmbeddingModelId(architect)) {
		return undefined;
	}
	const id = toDroxAgentsModelIdentifier(architect);
	return models.find(m => m.identifier === id);
}

export function isDroxEmbeddingLanguageModel(model: ILanguageModelChatMetadataAndIdentifier | undefined): boolean {
	if (!model) {
		return false;
	}
	const bare = parseDroxAgentsModelIdentifier(model.identifier);
	return bare !== undefined && isDroxEmbeddingModelId(bare);
}

export class DroxAgentsChatInputToolbarHost extends Disposable {

	private _toolbar: DroxAgentsComposerToolbar | undefined;
	private readonly _hostDisposables = this._register(new DisposableStore());

	constructor(
		private readonly _host: HTMLElement,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
	}

	mountIfNeeded(sessionType: string | undefined): void {
		if (!isDroxNativeChatStackEnabled(this.configurationService) || !isDroxAgentsChatSessionType(sessionType)) {
			this._unmount();
			return;
		}
		if (this._toolbar) {
			return;
		}
		this._hostDisposables.clear();
		this._host.style.display = '';
		const toolbar = this._hostDisposables.add(this.instantiationService.createInstance(DroxAgentsComposerToolbar));
		this._toolbar = toolbar;
		this._host.appendChild(toolbar.domNode);
	}

	private _unmount(): void {
		this._toolbar = undefined;
		this._hostDisposables.clear();
		dom.clearNode(this._host);
		this._host.style.display = 'none';
	}
}

export function createDroxAgentsChatInputToolbarHost(
	instantiationService: IInstantiationService,
	configurationService: IConfigurationService,
	parent: HTMLElement,
): DroxAgentsChatInputToolbarHost | undefined {
	if (!isDroxNativeChatStackEnabled(configurationService)) {
		return undefined;
	}
	const element = dom.append(parent, dom.$('.drox-agents-chat-input-toolbar-host'));
	element.style.display = 'none';
	return instantiationService.createInstance(DroxAgentsChatInputToolbarHost, element);
}
