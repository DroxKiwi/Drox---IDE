/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { localize } from '../../../../../nls.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { IDroxRegulationService } from '../../common/regulation/droxRegulationServiceContract.js';
import { droxRegulationModelKey } from '../../common/regulation/droxRegulationTypes.js';
import { renderDroxRegulationConsole } from './droxRegulationConsole.js';
import '../codebase/media/droxCodebaseCockpit.css';

/**
 * Dedicated sidebar view for model regulation (not nested under Codebase).
 */
export class DroxRegulationViewPane extends ViewPane {

	private _body: HTMLElement | undefined;
	private _loadedRoot: string | undefined;

	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IDroxRegulationService private readonly regulationService: IDroxRegulationService,
		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this._register(this.regulationService.onDidChangeScores(() => this._render()));
		this._register(this.regulationService.onDidChangeHistory(() => this._render()));
		this._register(this.regulationService.onDidChangeSurface(() => this._render()));
		this._register(this.runSettingsService.onDidChangeWorkspaceResource(() => {
			this._loadedRoot = undefined;
			void this._ensureLoaded().then(() => this._render());
		}));
		void this._ensureLoaded();
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('drox-codebase-cockpit');
		this._body = dom.append(container, dom.$('.drox-codebase-cockpit-body.drox-regulation-view'));
		this._render();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this._body) {
			this._body.style.height = `${height}px`;
			this._body.style.width = `${width}px`;
		}
	}

	private _render(): void {
		if (!this._body) {
			return;
		}
		const prevBodyScroll = this._body.scrollTop;
		const prevListScroll = this._body.querySelector('.drox-regulation-history-list')?.scrollTop ?? 0;
		void this._ensureLoaded();
		dom.clearNode(this._body);

		const header = dom.append(this._body, dom.$('.drox-codebase-section'));
		dom.append(header, dom.$('h3', undefined, localize('drox.regulation.view.title', 'Model regulation')));
		const ws = this.runSettingsService.getWorkspaceResource()?.fsPath;
		dom.append(header, dom.$('p.drox-codebase-muted', undefined, ws ?? localize('drox.regulation.noRoot', 'No folder open')));

		const llm = this.runSettingsService.getLlmSettings();
		const modelKey = droxRegulationModelKey(llm.llmProvider, llm.model);
		renderDroxRegulationConsole(this._body, {
			modelKey,
			scores: this.regulationService.getScores(modelKey),
			history: this.regulationService.list({ limit: 40 }),
			surface: this.regulationService.getState(),
			prevListScroll,
			hideHeading: true,
			onSetLeverMode: (lever, mode) => this.regulationService.setLeverMode(lever, mode),
			onSetLeverModule: (lever, module) => this.regulationService.setLeverModule(lever, module),
		});

		this._body.scrollTop = prevBodyScroll;
	}

	private async _ensureLoaded(): Promise<void> {
		const root = this.runSettingsService.getWorkspaceResource()?.fsPath;
		if (!root || root === this._loadedRoot) {
			return;
		}
		this._loadedRoot = root;
		try {
			await this.regulationService.ensureHistoryLoaded(root);
		} catch {
			// Best-effort.
		}
	}
}
