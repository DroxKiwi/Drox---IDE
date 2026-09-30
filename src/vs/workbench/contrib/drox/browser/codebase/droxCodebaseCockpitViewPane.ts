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
import { IDroxCodebaseHit } from '../../common/codebase/droxCodebaseTypes.js';
import './media/droxCodebaseCockpit.css';

/**
 * Shared @Codebase cockpit body (sidebar host first — Agents/panel later).
 * Spec: docs/1.5/1.5.21/codebase/PLAN-COCKPIT.md
 */
export class DroxCodebaseCockpitViewPane extends ViewPane {

	private _body: HTMLElement | undefined;
	private _probeInput: HTMLInputElement | undefined;
	private _probeResults: HTMLElement | undefined;
	private _lastHits: readonly IDroxCodebaseHit[] = [];

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
		const prevQuery = this._probeInput?.value ?? '';
		const s = this.supervision.snapshot;
		dom.clearNode(this._body);

		const header = dom.append(this._body, dom.$('.drox-codebase-section'));
		dom.append(header, dom.$('h3', undefined, localize('drox.codebase.cockpit.title', 'Codebase index')));
		dom.append(header, dom.$('p.drox-codebase-muted', undefined, s.rootFsPath ?? localize('drox.codebase.noRoot', 'No folder open')));
		dom.append(header, dom.$('p', undefined, localize('drox.codebase.state', 'State: {0}', s.state)));
		if (s.lastError) {
			dom.append(header, dom.$('p', undefined, s.lastError));
		}

		const embed = dom.append(this._body, dom.$('.drox-codebase-section'));
		dom.append(embed, dom.$('h4', undefined, localize('drox.codebase.embed', 'Embed')));
		dom.append(embed, dom.$('p', undefined, s.embed.loaded
			? localize('drox.codebase.embedLoaded', 'Loaded ({0})', s.embed.modelId ?? '?')
			: localize('drox.codebase.embedNotLoaded', 'Not loaded — {0}', s.mode === 'hybrid' ? 'hybrid ready' : 'lexical only (CB2)')));
		dom.append(embed, dom.$('p.drox-codebase-muted', undefined, localize('drox.codebase.mode', 'Retrieval mode: {0}', s.mode)));

		const storage = dom.append(this._body, dom.$('.drox-codebase-section'));
		dom.append(storage, dom.$('h4', undefined, localize('drox.codebase.storage', 'Storage')));
		dom.append(storage, dom.$('p', undefined, localize(
			'drox.codebase.storageStats',
			'{0} files · {1} chunks · {2} vectors · {3} bytes',
			String(s.storage.files),
			String(s.storage.chunks),
			String(s.storage.vectors),
			String(s.storage.bytes),
		)));
		const indexDir = this.supervision.getIndexDirFsPath();
		if (indexDir) {
			dom.append(storage, dom.$('p.drox-codebase-muted', undefined, indexDir));
		}

		const actions = dom.append(this._body, dom.$('.drox-codebase-actions'));
		const reindexBtn = dom.append(actions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
		reindexBtn.textContent = localize('drox.codebase.reindex', 'Reindex');
		reindexBtn.disabled = s.state === 'indexing' || !s.rootFsPath;
		reindexBtn.onclick = () => void this.supervision.reindex();

		const purgeBtn = dom.append(actions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
		purgeBtn.textContent = localize('drox.codebase.purge', 'Purge');
		purgeBtn.disabled = !s.rootFsPath;
		purgeBtn.onclick = () => void this.supervision.purge();

		const probe = dom.append(this._body, dom.$('.drox-codebase-section'));
		dom.append(probe, dom.$('h4', undefined, localize('drox.codebase.probe', 'Lexical probe')));
		this._probeInput = dom.append(probe, dom.$('input.drox-codebase-probe-input')) as HTMLInputElement;
		this._probeInput.type = 'text';
		this._probeInput.placeholder = localize('drox.codebase.probePlaceholder', 'e.g. checkout branch');
		this._probeInput.value = prevQuery;
		const probeBtn = dom.append(probe, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
		probeBtn.textContent = localize('drox.codebase.runProbe', 'Probe');
		probeBtn.onclick = () => void this._runProbe();
		this._probeResults = dom.append(probe, dom.$('.drox-codebase-probe-results'));
		this._renderHits(this._lastHits);

		if (s.alerts.length) {
			const alerts = dom.append(this._body, dom.$('.drox-codebase-section'));
			dom.append(alerts, dom.$('h4', undefined, localize('drox.codebase.alerts', 'Alerts')));
			for (const a of s.alerts) {
				dom.append(alerts, dom.$('p', undefined, `[${a.severity}] ${a.message}`));
			}
		}
	}

	private async _runProbe(): Promise<void> {
		const q = this._probeInput?.value ?? '';
		this._lastHits = await this.supervision.probeRetrieval(q);
		this._renderHits(this._lastHits);
	}

	private _renderHits(hits: readonly IDroxCodebaseHit[]): void {
		if (!this._probeResults) {
			return;
		}
		dom.clearNode(this._probeResults);
		if (!hits.length) {
			dom.append(this._probeResults, dom.$('p.drox-codebase-muted', undefined, localize('drox.codebase.noHits', 'No hits')));
			return;
		}
		for (const hit of hits) {
			const row = dom.append(this._probeResults, dom.$('div.drox-codebase-hit'));
			dom.append(row, dom.$('p', undefined, `${hit.path}:${hit.startLine}-${hit.endLine} (score ${hit.score})`));
			dom.append(row, dom.$('pre.drox-codebase-preview', undefined, hit.preview));
		}
	}
}
