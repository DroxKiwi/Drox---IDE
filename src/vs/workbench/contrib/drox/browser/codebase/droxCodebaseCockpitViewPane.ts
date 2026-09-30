/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { localize } from '../../../../../nls.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IDroxCodebaseSupervisionService } from '../../common/codebase/droxCodebaseSupervisionService.js';
import './media/droxCodebaseCockpit.css';

/**
 * Shared @Codebase cockpit body (sidebar host first — Agents/panel later).
 * Spec: docs/1.5/1.5.21/codebase/PLAN-COCKPIT.md
 */
export class DroxCodebaseCockpitViewPane extends ViewPane {

	private _body: HTMLElement | undefined;

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
		@IDroxCodebaseSupervisionService private readonly supervision: IDroxCodebaseSupervisionService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this._register(this.supervision.onDidChangeSnapshot(() => this._render()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('drox-codebase-cockpit');
		this._body = dom.append(container, dom.$('.drox-codebase-cockpit-body'));
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
		const s = this.supervision.snapshot;
		dom.clearNode(this._body);

		const header = dom.append(this._body, dom.$('.drox-codebase-section'));
		dom.append(header, dom.$('h3', undefined, localize('drox.codebase.cockpit.title', 'Codebase index')));
		dom.append(header, dom.$('p.drox-codebase-muted', undefined, s.rootFsPath ?? localize('drox.codebase.noRoot', 'No folder open')));
		dom.append(header, dom.$('p', undefined, localize('drox.codebase.state', 'State: {0}', s.state)));

		const embed = dom.append(this._body, dom.$('.drox-codebase-section'));
		dom.append(embed, dom.$('h4', undefined, localize('drox.codebase.embed', 'Embed')));
		dom.append(embed, dom.$('p', undefined, s.embed.loaded
			? localize('drox.codebase.embedLoaded', 'Loaded ({0})', s.embed.modelId ?? '?')
			: localize('drox.codebase.embedNotLoaded', 'Not loaded (CB2)')));

		const storage = dom.append(this._body, dom.$('.drox-codebase-section'));
		dom.append(storage, dom.$('h4', undefined, localize('drox.codebase.storage', 'Storage')));
		dom.append(storage, dom.$('p', undefined, localize(
			'drox.codebase.storageStats',
			'{0} files · {1} chunks · {2} vectors',
			String(s.storage.files),
			String(s.storage.chunks),
			String(s.storage.vectors),
		)));
		const indexDir = this.supervision.getIndexDirFsPath();
		if (indexDir) {
			dom.append(storage, dom.$('p.drox-codebase-muted', undefined, indexDir));
		}

		const actions = dom.append(this._body, dom.$('.drox-codebase-actions'));
		const reindexBtn = dom.append(actions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
		reindexBtn.textContent = localize('drox.codebase.reindex', 'Reindex');
		reindexBtn.onclick = () => void this.supervision.reindex();

		const purgeBtn = dom.append(actions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
		purgeBtn.textContent = localize('drox.codebase.purge', 'Purge');
		purgeBtn.onclick = () => void this.supervision.purge();

		if (s.alerts.length) {
			const alerts = dom.append(this._body, dom.$('.drox-codebase-section'));
			dom.append(alerts, dom.$('h4', undefined, localize('drox.codebase.alerts', 'Alerts')));
			for (const a of s.alerts) {
				dom.append(alerts, dom.$('p', undefined, `[${a.severity}] ${a.message}`));
			}
		}
	}
}
