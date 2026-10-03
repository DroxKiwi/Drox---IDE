/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
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
import { DroxSetting } from '../../common/droxConfiguration.js';
import { IDroxCodebaseSupervisionService } from '../../common/codebase/droxCodebaseSupervisionService.js';
import { IDroxCodebaseContextService } from '../../common/codebase/droxCodebaseContextService.js';
import { IDroxCodebaseHit } from '../../common/codebase/droxCodebaseTypes.js';
import { renderDroxCodebaseCockpitCatalog } from './cockpit/droxCodebaseCockpitCatalog.js';
import { renderDroxCodebaseCockpitEmbed } from './cockpit/droxCodebaseCockpitEmbed.js';
import { renderDroxCodebaseCockpitInject } from './cockpit/droxCodebaseCockpitInject.js';
import { renderDroxCodebaseCockpitHits, renderDroxCodebaseCockpitProbe } from './cockpit/droxCodebaseCockpitProbe.js';
import { renderDroxCodebaseCockpitPipeline } from './cockpit/droxCodebaseCockpitPipeline.js';
import { IDroxCodebaseCatalog } from '../../common/codebase/droxCodebaseCatalog.js';
import './media/droxCodebaseCockpit.css';

/** Poll embed.status for live RSS while the cockpit body is visible. */
const EMBED_RSS_POLL_MS = 2000;

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
	private _catalog: IDroxCodebaseCatalog | undefined;
	private _catalogBusy = false;
	private _catalogExpanded = new Set<string>();
	private _catalogSelected = new Set<string>();
	private _exclusionGlobs: readonly string[] = [];
	private _lastCompactMsg: string | undefined;
	private _catalogRootKey: string | undefined;
	private _catalogStorageKey: string | undefined;
	private readonly _embedRssPoll: RunOnceScheduler;

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
		@IDroxCodebaseContextService private readonly codebaseContext: IDroxCodebaseContextService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@INotificationService private readonly notificationService: INotificationService,
		@IFileService private readonly fileService: IFileService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this._embedRssPoll = this._register(new RunOnceScheduler(() => {
			if (!this.isBodyVisible()) {
				return;
			}
			void this.supervision.refreshEmbedStatus().finally(() => {
				if (this.isBodyVisible()) {
					this._embedRssPoll.schedule();
				}
			});
		}, EMBED_RSS_POLL_MS));
		this._register(this.onDidChangeBodyVisibility(visible => {
			if (visible) {
				void this.supervision.refreshEmbedStatus();
				this._embedRssPoll.schedule();
			} else {
				this._embedRssPoll.cancel();
			}
		}));
		this._register(this.supervision.onDidChangeSnapshot(() => {
			const s = this.supervision.snapshot;
			const key = `${s.rootFsPath ?? ''}|${s.storage.files}|${s.storage.chunks}|${s.storage.bytes}`;
			if (key !== this._catalogStorageKey) {
				this._catalogStorageKey = key;
				void this._reloadCatalog();
			} else {
				this._render();
			}
		}));
		this._register(this.codebaseContext.onDidChangeForceNext(() => this._render()));
		void this._reloadCatalog();
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
		const prevBodyScroll = this._body.scrollTop;
		const prevCatalogListScroll = this._body.querySelector('.drox-codebase-catalog-list')?.scrollTop ?? 0;
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

		if (s.alerts.length) {
			const alerts = dom.append(this._body, dom.$('.drox-codebase-section'));
			dom.append(alerts, dom.$('h4', undefined, localize('drox.codebase.alerts', 'Alerts')));
			for (const a of s.alerts) {
				const row = dom.append(alerts, dom.$('p.drox-codebase-alert', undefined, `[${a.severity}] ${a.message}`));
				if (a.severity === 'warn') {
					row.classList.add('is-warn');
				} else if (a.severity === 'error') {
					row.classList.add('is-error');
				}
			}
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

		renderDroxCodebaseCockpitInject(this._body, {
			lastInject: this.codebaseContext.lastInject,
			autoEnabled: this.codebaseContext.isAutoInjectEnabled(),
			forceArmed: this.codebaseContext.forceNextRun,
			onToggleAuto: () => void this._toggleAutoInject(),
		});

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

		renderDroxCodebaseCockpitCatalog(this._body, this._catalog, this._catalogBusy, {
			onRefresh: () => void this._reloadCatalog(true),
			onCompact: () => void this._compactCatalog(),
			onDelete: paths => void this._deleteCatalogPaths(paths),
			onExclude: paths => void this._excludeCatalogPaths(paths),
			onRebuild: paths => void this._rebuildCatalogPaths(paths),
			onAddExclusionGlob: glob => void this._addExclusionGlob(glob),
			onRemoveExclusionGlob: glob => void this._removeExclusionGlob(glob),
		}, {
			expandedPaths: this._catalogExpanded,
			selectedPaths: this._catalogSelected,
			exclusionGlobs: this._exclusionGlobs,
			lastCompactMsg: this._lastCompactMsg,
			onToggleExpand: path => {
				if (this._catalogExpanded.has(path)) {
					this._catalogExpanded.delete(path);
				} else {
					this._catalogExpanded.add(path);
				}
				this._render();
			},
			onToggleSelect: path => {
				if (this._catalogSelected.has(path)) {
					this._catalogSelected.delete(path);
				} else {
					this._catalogSelected.add(path);
				}
				this._render();
			},
		});

		const probe = renderDroxCodebaseCockpitProbe(this._body, {
			mode: s.mode,
			prevQuery,
			onProbe: () => void this._runProbe(),
		});
		this._probeInput = probe.input;
		this._probeResults = probe.results;
		renderDroxCodebaseCockpitHits(this._probeResults, this._lastHits);

		if (this._pipelineLogEl && this._pipelineLogPinnedToBottom) {
			this._pipelineLogEl.scrollTop = this._pipelineLogEl.scrollHeight;
		} else if (this._pipelineLogEl) {
			this._pipelineLogEl.scrollTop = prevScroll;
		}

		// Preserve scroll after full DOM rebuild (catalogue toggles, snapshot refresh).
		this._body.scrollTop = prevBodyScroll;
		const catalogList = this._body.querySelector('.drox-codebase-catalog-list');
		if (catalogList) {
			catalogList.scrollTop = prevCatalogListScroll;
		}
	}

	private async _toggleAutoInject(): Promise<void> {
		const next = !this.codebaseContext.isAutoInjectEnabled();
		try {
			await this.configurationService.updateValue(DroxSetting.CodebaseAutoInject, next, ConfigurationTarget.USER);
			this._render();
		} catch (err) {
			this.notificationService.error(localize(
				'drox.codebase.inject.toggleFail',
				'Could not toggle auto-inject: {0}',
				err instanceof Error ? err.message : String(err),
			));
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

	private async _reloadCatalog(forceRender = false): Promise<void> {
		const root = this.supervision.snapshot.rootFsPath;
		if (root !== this._catalogRootKey) {
			this._catalogRootKey = root;
			this._catalogExpanded.clear();
			this._catalogSelected.clear();
			this._lastCompactMsg = undefined;
			this._catalog = undefined;
			this._exclusionGlobs = [];
		}
		if (!root) {
			this._catalog = { files: [], totalFiles: 0, totalChunks: 0, totalVectors: 0, textBytes: 0 };
			this._exclusionGlobs = [];
			if (forceRender) {
				this._render();
			}
			return;
		}
		this._catalogBusy = true;
		if (forceRender) {
			this._render();
		}
		try {
			const [catalog, exclusions] = await Promise.all([
				this.supervision.listCatalog(),
				this.supervision.listExclusions(),
			]);
			this._catalog = catalog;
			this._exclusionGlobs = exclusions;
			for (const p of [...this._catalogSelected]) {
				if (!this._catalog.files.some(f => f.path === p)) {
					this._catalogSelected.delete(p);
				}
			}
		} catch (err) {
			this.notificationService.error(localize(
				'drox.codebase.catalogLoadFail',
				'Catalogue load failed: {0}',
				err instanceof Error ? err.message : String(err),
			));
		} finally {
			this._catalogBusy = false;
			this._render();
		}
	}

	private async _deleteCatalogPaths(paths: readonly string[]): Promise<void> {
		if (!paths.length) {
			return;
		}
		this._catalogBusy = true;
		this._render();
		try {
			const result = await this.supervision.deleteCatalogPaths(paths);
			for (const p of paths) {
				this._catalogSelected.delete(p);
				this._catalogExpanded.delete(p);
			}
			this.notificationService.info(localize(
				'drox.codebase.catalogDeleteOk',
				'Removed {0} chunks · {1} vectors',
				String(result.removedChunks),
				String(result.removedVectors),
			));
			await this._reloadCatalog();
		} catch (err) {
			this.notificationService.error(localize(
				'drox.codebase.catalogDeleteFail',
				'Delete failed: {0}',
				err instanceof Error ? err.message : String(err),
			));
			this._catalogBusy = false;
			this._render();
		}
	}

	private async _excludeCatalogPaths(paths: readonly string[]): Promise<void> {
		if (!paths.length) {
			return;
		}
		this._catalogBusy = true;
		this._render();
		try {
			const result = await this.supervision.excludeCatalogPaths(paths);
			for (const p of paths) {
				this._catalogSelected.delete(p);
				this._catalogExpanded.delete(p);
			}
			this._exclusionGlobs = result.globs;
			this.notificationService.info(localize(
				'drox.codebase.catalogExcludeOk',
				'Excluded — removed {0} chunks · {1} globs active',
				String(result.removedChunks),
				String(result.globs.length),
			));
			await this._reloadCatalog();
		} catch (err) {
			this.notificationService.error(localize(
				'drox.codebase.catalogExcludeFail',
				'Exclude failed: {0}',
				err instanceof Error ? err.message : String(err),
			));
			this._catalogBusy = false;
			this._render();
		}
	}

	private async _rebuildCatalogPaths(paths: readonly string[]): Promise<void> {
		if (!paths.length) {
			return;
		}
		this._catalogBusy = true;
		this._render();
		try {
			await this.supervision.rebuildCatalogPaths(paths);
			this.notificationService.info(localize(
				'drox.codebase.catalogRebuildOk',
				'Rebuilt {0} path(s)',
				String(paths.length),
			));
			await this._reloadCatalog();
		} catch (err) {
			this.notificationService.error(localize(
				'drox.codebase.catalogRebuildFail',
				'Rebuild failed: {0}',
				err instanceof Error ? err.message : String(err),
			));
			this._catalogBusy = false;
			this._render();
		}
	}

	private async _addExclusionGlob(glob: string): Promise<void> {
		this._catalogBusy = true;
		this._render();
		try {
			const result = await this.supervision.excludeCatalogPaths([glob]);
			this._exclusionGlobs = result.globs;
			await this._reloadCatalog();
		} catch (err) {
			this.notificationService.error(localize(
				'drox.codebase.exclusionAddFail',
				'Add exclusion failed: {0}',
				err instanceof Error ? err.message : String(err),
			));
			this._catalogBusy = false;
			this._render();
		}
	}

	private async _removeExclusionGlob(glob: string): Promise<void> {
		this._catalogBusy = true;
		this._render();
		try {
			const next = this._exclusionGlobs.filter(g => g !== glob);
			this._exclusionGlobs = await this.supervision.setExclusions(next);
			this.notificationService.info(localize(
				'drox.codebase.exclusionRemoveOk',
				'Exclusion removed — Reindex to pick up matching files again.',
			));
			await this._reloadCatalog();
		} catch (err) {
			this.notificationService.error(localize(
				'drox.codebase.exclusionRemoveFail',
				'Remove exclusion failed: {0}',
				err instanceof Error ? err.message : String(err),
			));
			this._catalogBusy = false;
			this._render();
		}
	}

	private async _compactCatalog(): Promise<void> {
		this._catalogBusy = true;
		this._render();
		try {
			const result = await this.supervision.compactCatalog();
			const delta = result.bytesBefore - result.bytesAfter;
			this._lastCompactMsg = localize(
				'drox.codebase.catalogCompactOk',
				'Compact: {0} → {1} bytes ({2}{3}) · orphans removed: {4}',
				String(result.bytesBefore),
				String(result.bytesAfter),
				delta >= 0 ? '-' : '+',
				String(Math.abs(delta)),
				String(result.orphanVectorsRemoved),
			);
			await this._reloadCatalog();
		} catch (err) {
			this.notificationService.error(localize(
				'drox.codebase.catalogCompactFail',
				'Compact failed: {0}',
				err instanceof Error ? err.message : String(err),
			));
			this._catalogBusy = false;
			this._render();
		}
	}
}
