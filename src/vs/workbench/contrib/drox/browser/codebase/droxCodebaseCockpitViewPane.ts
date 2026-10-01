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
import { DROX_EMBED_DEFAULT_MODEL_ID, DROX_EMBED_DEFAULT_MODEL_LABEL } from '../../common/codebase/droxCodebaseEmbedPaths.js';
import { IDroxCodebaseSupervisionService } from '../../common/codebase/droxCodebaseSupervisionService.js';
import { IDroxCodebaseHit, IDroxCodebasePipelineEvent, IDroxCodebasePipelineStage } from '../../common/codebase/droxCodebaseTypes.js';
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

		this._renderPipelineSection(s.pipelineView.stages, s.pipelineView.events, s.pipeline.progressPct ?? s.pipelineView.progressPct, s.pipelineView.currentMessage, s.pipeline.trigger ?? s.pipelineView.trigger);

		this._renderEmbedSection(s.embed, s.mode, prevEmbedPath);

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
		dom.append(probe, dom.$('h4', undefined, s.mode === 'hybrid'
			? localize('drox.codebase.probeHybrid', 'Hybrid probe')
			: localize('drox.codebase.probe', 'Lexical probe')));
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

		if (this._pipelineLogEl && this._pipelineLogPinnedToBottom) {
			this._pipelineLogEl.scrollTop = this._pipelineLogEl.scrollHeight;
		} else if (this._pipelineLogEl) {
			this._pipelineLogEl.scrollTop = prevScroll;
		}
	}

	private _renderPipelineSection(
		stages: readonly IDroxCodebasePipelineStage[],
		events: readonly IDroxCodebasePipelineEvent[],
		progressPct: number,
		currentMessage: string | undefined,
		trigger: string | undefined,
	): void {
		if (!this._body) {
			return;
		}
		const section = dom.append(this._body, dom.$('.drox-codebase-section.drox-codebase-pipeline'));
		dom.append(section, dom.$('h4', undefined, localize('drox.codebase.pipeline', 'Vectorization pipeline')));
		dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
			'drox.codebase.pipelineHint',
			'Live steps from the local engine (scan → chunk → embed → write). Use Export to share a debug dump.',
		)));
		if (trigger || currentMessage) {
			dom.append(section, dom.$('p', undefined, [
				trigger ? localize('drox.codebase.pipelineTrigger', 'Trigger: {0}', trigger) : '',
				currentMessage ?? '',
			].filter(Boolean).join(' · ')));
		}

		const stagesRow = dom.append(section, dom.$('.drox-codebase-pipeline-stages'));
		for (const stage of stages) {
			const chip = dom.append(stagesRow, dom.$(`.drox-codebase-pipeline-stage.is-${stage.state}`));
			dom.append(chip, dom.$('span.drox-codebase-pipeline-stage-dot'));
			dom.append(chip, dom.$('span', undefined, stage.label));
		}

		const bar = dom.append(section, dom.$('.drox-codebase-pipeline-bar'));
		const fill = dom.append(bar, dom.$('.drox-codebase-pipeline-bar-fill')) as HTMLElement;
		fill.style.width = `${Math.max(0, Math.min(100, progressPct))}%`;
		dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
			'drox.codebase.pipelineProgress',
			'Progress: {0}%',
			String(Math.round(progressPct)),
		)));

		const actions = dom.append(section, dom.$('.drox-codebase-actions'));
		const exportBtn = dom.append(actions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
		exportBtn.textContent = localize('drox.codebase.exportDiag', 'Export diag');
		exportBtn.title = localize('drox.codebase.exportDiagTitle', 'Copy JSON to clipboard and write diag-export-*.json under .drox/codebase-index');
		exportBtn.onclick = () => void this._exportDiag();

		const clearBtn = dom.append(actions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
		clearBtn.textContent = localize('drox.codebase.clearPipeline', 'Clear log');
		clearBtn.onclick = () => this.supervision.clearPipelineLog();

		this._pipelineLogEl = dom.append(section, dom.$('.drox-codebase-pipeline-log'));
		const recent = events.slice(-80);
		if (!recent.length) {
			dom.append(this._pipelineLogEl, dom.$('p.drox-codebase-muted', undefined, localize(
				'drox.codebase.pipelineEmpty',
				'No steps yet — open a folder or click Reindex.',
			)));
			return;
		}
		for (const ev of recent) {
			const row = dom.append(this._pipelineLogEl, dom.$(`.drox-codebase-pipeline-event.is-${ev.status}`));
			const time = new Date(ev.at).toLocaleTimeString();
			const pathBit = ev.path ? ` · ${ev.path}` : '';
			dom.append(row, dom.$('span.drox-codebase-pipeline-event-meta', undefined, `${time} · ${ev.kind}`));
			dom.append(row, dom.$('span.drox-codebase-pipeline-event-msg', undefined, `${ev.message}${pathBit}`));
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

	private _renderEmbedSection(
		embed: typeof this.supervision.snapshot.embed,
		mode: typeof this.supervision.snapshot.mode,
		prevEmbedPath: string | undefined,
	): void {
		if (!this._body) {
			return;
		}
		const section = dom.append(this._body, dom.$('.drox-codebase-section'));
		dom.append(section, dom.$('h4', undefined, localize('drox.codebase.embed', 'Embed')));

		const callout = dom.append(section, dom.$('.drox-codebase-embed-callout'));
		dom.append(callout, dom.$('p.drox-codebase-embed-callout-title', undefined, localize(
			'drox.codebase.embedWhatTitle',
			'What MiniLM does (visible by design)',
		)));
		const list = dom.append(callout, dom.$('ul.drox-codebase-embed-facts'));
		const facts = [
			localize('drox.codebase.embedFact1', 'Turns each code chunk into a vector so search can match meaning, not only exact words.'),
			localize('drox.codebase.embedFact2', 'Runs locally in drox.exe (llama.cpp) — no cloud upload of your codebase for embeddings.'),
			localize('drox.codebase.embedFact3', 'Default model: {0} — small (~20 Mo), ~384 dimensions, embedding GGUF (not a chat LLM).', DROX_EMBED_DEFAULT_MODEL_LABEL),
			localize('drox.codebase.embedFact4', 'Used at Reindex (encode chunks) and at Probe (encode your query), then fused with lexical hits.'),
		];
		for (const fact of facts) {
			dom.append(list, dom.$('li', undefined, fact));
		}

		const sourceLabel = this._sourceLabel(embed.source);
		dom.append(section, dom.$('p', undefined, embed.loaded
			? localize('drox.codebase.embedLoaded', 'Loaded ({0})', embed.modelId ?? '?')
			: localize('drox.codebase.embedNotLoaded', 'Not loaded — {0}', mode === 'hybrid' ? 'hybrid ready' : 'lexical only')));
		dom.append(section, dom.$('p', undefined, localize('drox.codebase.mode', 'Retrieval mode: {0}', mode)));
		dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
			'drox.codebase.embedSource',
			'Active source: {0}',
			sourceLabel,
		)));
		if (embed.resolvedPath) {
			dom.append(section, dom.$('p.drox-codebase-muted', undefined, embed.resolvedPath));
		}
		if (embed.dimensions) {
			dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
				'drox.codebase.embedDims',
				'Dimensions: {0} · backend: {1}',
				String(embed.dimensions),
				embed.backend ?? '?',
			)));
		}
		dom.append(section, dom.$('p.drox-codebase-muted', undefined, localize(
			'drox.codebase.embedFormatHint',
			'Custom override: absolute path to an embedding GGUF (e.g. MiniLM / BGE-small). Chat models will not work here. File name default: {0}',
			DROX_EMBED_DEFAULT_MODEL_ID,
		)));

		this._embedPathInput = dom.append(section, dom.$('input.drox-codebase-probe-input')) as HTMLInputElement;
		this._embedPathInput.type = 'text';
		this._embedPathInput.placeholder = localize('drox.codebase.embedPathPlaceholder', 'Optional custom GGUF path…');
		this._embedPathInput.value = prevEmbedPath ?? embed.customPathSetting ?? '';

		const embedActions = dom.append(section, dom.$('.drox-codebase-actions'));
		const applyBtn = dom.append(embedActions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
		applyBtn.textContent = localize('drox.codebase.embedApplyPath', 'Use this GGUF');
		applyBtn.onclick = () => void this.supervision.setEmbedModelPath(this._embedPathInput?.value ?? '');

		const resetBtn = dom.append(embedActions, dom.$('button.drox-codebase-btn')) as HTMLButtonElement;
		resetBtn.textContent = localize('drox.codebase.embedResetDefaults', 'Reset to defaults');
		resetBtn.title = localize(
			'drox.codebase.embedResetDefaultsTitle',
			'Clear custom path and reload the bundled MiniLM shipped with Drox.',
		);
		resetBtn.onclick = () => {
			if (this._embedPathInput) {
				this._embedPathInput.value = '';
			}
			void this.supervision.resetEmbedDefaults();
		};
	}

	private _sourceLabel(source: typeof this.supervision.snapshot.embed.source): string {
		switch (source) {
			case 'custom':
				return localize('drox.codebase.source.custom', 'custom path (your override)');
			case 'env':
				return localize('drox.codebase.source.env', 'DROX_EMBED_MODEL_PATH (env)');
			case 'bundled':
				return localize('drox.codebase.source.bundled', 'bundled with the app (default MiniLM)');
			case 'userData':
				return localize('drox.codebase.source.userData', 'userData/drox/models');
			case 'repo':
				return localize('drox.codebase.source.repo', 'dev repo drox-engine/models');
			case 'missing':
				return localize('drox.codebase.source.missing', 'missing — package MiniLM or set a path');
			default:
				return localize('drox.codebase.source.unknown', 'unknown');
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
