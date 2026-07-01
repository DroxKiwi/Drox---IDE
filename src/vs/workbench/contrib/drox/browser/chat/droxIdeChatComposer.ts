/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Barre d'outils native (picker modèle + chips Agents) pour le chat IDE.
 * L'input (textarea, envoi, pièces jointes, @refs) reste dans la webview.
 */

import './media/droxIdeChatComposer.css';
import * as dom from '../../../../../base/browser/dom.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { DroxAgentsComposerToolbar } from '../agents/droxAgentsComposerToolbar.js';
import { isDroxAgentsWindowEnabled, isDroxIdeNativeChatTabEnabled } from '../../common/droxAgentsConfiguration.js';
import { DroxIdeModelPicker } from './droxIdeModelPicker.js';

export class DroxIdeChatComposerToolbar extends Disposable {

	readonly domNode: HTMLElement;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();

		this.domNode = dom.$('.drox-ide-chat-composer-toolbar-host');
		this._createToolbar(this.domNode);
	}

	private _createToolbar(container: HTMLElement): void {
		const toolbar = dom.append(container, dom.$('.drox-ide-chat-composer-toolbar'));
		const configContainer = dom.append(toolbar, dom.$('.sessions-chat-config-toolbar'));

		if (!isDroxAgentsWindowEnabled(this.configurationService) && !isDroxIdeNativeChatTabEnabled(this.configurationService)) {
			return;
		}

		try {
			const modelPicker = this._register(this.instantiationService.createInstance(DroxIdeModelPicker));
			modelPicker.render(configContainer);
			modelPicker.ensureValidModel();

			const droxToolbar = this._register(this.instantiationService.createInstance(DroxAgentsComposerToolbar));
			configContainer.appendChild(droxToolbar.domNode);
		} catch (err) {
			onUnexpectedError(err);
		}
	}
}
