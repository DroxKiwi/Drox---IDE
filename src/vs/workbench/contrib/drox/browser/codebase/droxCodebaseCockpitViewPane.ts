/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { localize } from '../../../../../nls.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { IDroxCodebaseSupervisionService } from '../../common/codebase/droxCodebaseSupervisionService.js';
import { IDroxCodebaseHit } from '../../common/codebase/droxCodebaseTypes.js';
import { renderDroxCodebaseCockpitEmbed } from './cockpit/droxCodebaseCockpitEmbed.js';
import { renderDroxCodebaseCockpitHits, renderDroxCodebaseCockpitProbe } from './cockpit/droxCodebaseCockpitProbe.js';
import { renderDroxCodebaseCockpitPipeline } from './cockpit/droxCodebaseCockpitPipeline.js';
import './media/droxCodebaseCockpit.css';

/**
 * Shared @Codebase cockpit body (sidebar host first — Agents/panel later).
 * Spec: docs/1.5/1.5.21/codebase/PLAN-COCKPIT.md
 */
export class DroxCodebaseCockpitViewPane extends ViewPane {

	private _body: HTMLElement | undefined;
	private _probeInput: HTMLInputElement | undefined;
	private _embedPathInput: HTMLInputElement | undefined;
	private _probeResults: HTMLElement | undefined;
	private _pipelineLogEl: HTMLElement | undefined;
	private _lastHits: readonly IDroxCodebaseHit[] = [];
	private _pipelineLogPinnedToBottom = true;

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
		@IClipboardService private readonly clipboardService: IClipboardService,
		@INotificationService private readonly notificationService: INotificationService,
		@IFileService private readonly fileService: IFileService,
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
		const prevEmbedPath = this._embedPathInput?.value;
		const prevScroll = this._pipelineLogEl?.scrollTop ?? 0;
		const prevScrollHeight = this._pipelineLogEl?.scrollHeight ?? 0;
		const prevClientHeight = this._pipelineLogEl?.clientHeight ?? 0;
		if (this._pipelineLogEl) {
			this._pipelineLogPinnedToBottom = prevScroll + prevClientHeight >= prevScrollHeight - 8;
		}
		const s = this.supervision.snapshot;
		dom.clearNode(this._body);

		const header = dom.append(this._body, dom.$('.drox-codebase-section'));
		dom.append(header, dom.$('h3', undefined, localize('drox.codebase.cockpit.title', 'Codebase index')));
		dom.append(header, dom.$('p.drox-codebase-muted', undefined, s.rootFsPath ?? localize('drox.codebase.noRoot', 'No folder open')));
		dom.append(header, dom.$('p', undefined, localize('drox.codebase.state', 'State: {0}', s.state)));
		if (s.lastError) {
			dom.append(header, dom.$('p', undefined, s.lastError));
		}

		const { logEl } = renderDroxCodebaseCockpitPipeline(this._body, {
			stages: s.pipelineView.stages,
			events: s.pipelineView.events,
			progressPct: s.pipeline.progressPct ?? s.pipelineView.progressPct,
			currentMessage: s.pipelineView.currentMessage,
			trigger: s.pipeline.trigger ?? s.pipelineView.trigger,
			onExport: () => void this._exportDiag(),
			onClear: () => this.supervision.clearPipelineLog(),
		});
		this._pipelineLogEl = logEl;

		const { pathInput } = renderDroxCodebaseCockpitEmbed(this._body, {
			embed: s.embed,
			mode: s.mode,
			prevEmbedPath,
			onApplyPath: path => void this.supervision.setEmbedModelPath(path),
			onResetDefaults: () => void this.supervision.resetEmbedDefaults(),
		});
		this._embedPathInput = pathInput;

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

		const probe = renderDroxCodebaseCockpitProbe(this._body, {
			mode: s.mode,
			prevQuery,
			onProbe: () => void this._runProbe(),
		});
		this._probeInput = probe.input;
		this._probeResults = probe.results;
		renderDroxCodebaseCockpitHits(this._probeResults, this._lastHits);

		if (s.alerts.length) {
			const alerts = dom.append(this._body, dom.$('.drox-codebase-section'));
			dom.append(alerts, dom.$('h4', undefined, localize('drox.codebase.alerts', 'Alerts')));
			for (const a of s.alerts) {
				dom.append(alerts, dom.$('p', undefined, `[${a.severity}] ${a.message}`));
			}
		}

		if (this._pipelineLogEl && this._pipelineLogPinnedToBottom) {
			this._pipelineLogEl.scrollTop = this._pipelineLogEl.scrollHeight;
		} else if (this._pipelineLogEl) {
			this._pipelineLogEl.scrollTop = prevScroll;
		}
	}

	private async _exportDiag(): Promise<void> {
		try {
			const bundle = this.supervision.buildDiagnosticsExport(this._lastHits);
			const json = JSON.stringify(bundle, null, 2);
			await this.clipboardService.writeText(json);
			const indexDir = this.supervision.getIndexDirFsPath();
			let savedAs: string | undefined;
			if (indexDir) {
				const stamp = new Date().toISOString().replace(/[:.]/g, '-');
				const fileUri = URI.file(`${indexDir.replace(/[\\/]$/, '')}/diag-export-${stamp}.json`);
				await this.fileService.createFolder(URI.file(indexDir));
				await this.fileService.writeFile(fileUri, VSBuffer.fromString(json));
				savedAs = fileUri.fsPath;
			}
			this.notificationService.info(savedAs
				? localize('drox.codebase.exportOkFile', 'Diag copied to clipboard and saved to {0}', savedAs)
				: localize('drox.codebase.exportOkClip', 'Diag copied to clipboard'));
		} catch (err) {
			this.notificationService.error(localize(
				'drox.codebase.exportFail',
				'Export failed: {0}',
				err instanceof Error ? err.message : String(err),
			));
		}
	}

	private async _runProbe(): Promise<void> {
		const q = this._probeInput?.value ?? '';
		this._lastHits = await this.supervision.probeRetrieval(q);
		if (this._probeResults) {
			renderDroxCodebaseCockpitHits(this._probeResults, this._lastHits);
		}
	}
}
