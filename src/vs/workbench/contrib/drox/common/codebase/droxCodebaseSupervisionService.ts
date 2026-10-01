/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { isEqualOrParent, relativePath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { FileChangeType, IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { DroxSetting } from '../droxConfiguration.js';
import { IDroxEngineService } from '../droxEngineService.js';
import { DroxCodebaseEmbedClient } from './droxCodebaseEmbedClient.js';
import {
	DROX_EMBED_DEFAULT_MODEL_ID,
	DROX_EMBED_DEFAULT_MODEL_LABEL,
	resolveDroxEmbedModelPathDetailed,
} from './droxCodebaseEmbedPaths.js';
import { droxCodebaseShouldSkipDirName, droxCodebaseShouldSkipFileName } from './droxCodebaseIgnore.js';
import { IDroxCodebaseIndexService } from './droxCodebaseIndexService.js';
import { droxCodebaseIndexDir } from './droxCodebasePaths.js';
import { createEmptyCodebaseSnapshot, createEmptyPipelineView, buildDroxCodebasePipelineView, IDroxCodebaseCockpitSnapshot, IDroxCodebaseDiagExport, IDroxCodebaseEmbedStats, IDroxCodebaseHit, IDroxCodebasePipelineEvent } from './droxCodebaseTypes.js';

/** Debounce for CB2b file-watcher incremental updates (ms). */
const CB2B_INVALIDATE_DEBOUNCE_MS = 600;
const PIPELINE_LOG_MAX = 200;
const PIPELINE_UI_THROTTLE_MS = 200;

export const IDroxCodebaseSupervisionService = createDecorator<IDroxCodebaseSupervisionService>('droxCodebaseSupervisionService');

export interface IDroxCodebaseSupervisionService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSnapshot: Event<void>;
	readonly snapshot: IDroxCodebaseCockpitSnapshot;
	setActiveRoot(root: URI | undefined): void;
	refresh(): Promise<void>;
	reindex(): Promise<void>;
	pause(): void;
	resume(): void;
	purge(): Promise<void>;
	probeRetrieval(query: string): Promise<readonly IDroxCodebaseHit[]>;
	getIndexDirFsPath(): string | undefined;
	/** Refresh embed.status from drox.exe (CB2). */
	refreshEmbedStatus(): Promise<void>;
	/** Persist custom GGUF path (empty clears override). Reloads model when possible. */
	setEmbedModelPath(path: string): Promise<void>;
	/** Clear custom path + env expectation → back to bundled MiniLM default. */
	resetEmbedDefaults(): Promise<void>;
	/** Clear the in-memory pipeline journal (cockpit). */
	clearPipelineLog(): void;
	/** Build JSON diag export (snapshot + pipeline + last probe). */
	buildDiagnosticsExport(lastProbeHits?: readonly IDroxCodebaseHit[]): IDroxCodebaseDiagExport;
}

export class DroxCodebaseSupervisionService extends Disposable implements IDroxCodebaseSupervisionService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSnapshot = this._register(new Emitter<void>());
	readonly onDidChangeSnapshot = this._onDidChangeSnapshot.event;

	private readonly _embedClient: DroxCodebaseEmbedClient;
	private _overrideRoot: URI | undefined;
	private _snapshot: IDroxCodebaseCockpitSnapshot = createEmptyCodebaseSnapshot();
	private _autoIndexInFlight = false;
	private readonly _pendingInvalidate = new Set<string>();
	private readonly _invalidateScheduler: RunOnceScheduler;
	private readonly _pipelineEvents: IDroxCodebasePipelineEvent[] = [];
	private readonly _pipelineUiScheduler: RunOnceScheduler;
	private _lastProbeHits: readonly IDroxCodebaseHit[] = [];

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IDroxCodebaseIndexService private readonly indexService: IDroxCodebaseIndexService,
		@IDroxEngineService engineService: IDroxEngineService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
	) {
		super();
		this._embedClient = new DroxCodebaseEmbedClient(engineService);
		this._invalidateScheduler = this._register(new RunOnceScheduler(() => {
			void this._flushInvalidations();
		}, CB2B_INVALIDATE_DEBOUNCE_MS));
		this._pipelineUiScheduler = this._register(new RunOnceScheduler(() => {
			this._publishPipelineView();
		}, PIPELINE_UI_THROTTLE_MS));
		this._register(this.indexService.onDidPipelineEvent(ev => {
			this._pipelineEvents.push(ev);
			while (this._pipelineEvents.length > PIPELINE_LOG_MAX) {
				this._pipelineEvents.shift();
			}
			if (ev.kind === 'run_done' || ev.kind === 'error' || ev.status === 'error') {
				this._publishPipelineView();
			} else {
				this._pipelineUiScheduler.schedule();
			}
		}));
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			void this.refresh().then(() => this._scheduleAutoIndex('workspace-folders'));
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(DroxSetting.CodebaseEmbedModelPath)) {
				void this.refreshEmbedStatus();
			}
		}));
		this._register(this.fileService.onDidFilesChange(e => {
			const root = this._resolveRootUri();
			if (!root) {
				return;
			}
			const candidates = [...e.rawAdded, ...e.rawUpdated, ...e.rawDeleted];
			for (const uri of candidates) {
				if (!isEqualOrParent(uri, root)) {
					continue;
				}
				if (e.contains(uri, FileChangeType.ADDED, FileChangeType.UPDATED, FileChangeType.DELETED)) {
					this._queueInvalidate(uri);
				}
			}
		}));
		void this.refresh().then(() => this._scheduleAutoIndex('startup'));
	}

	get snapshot(): IDroxCodebaseCockpitSnapshot {
		return this._snapshot;
	}

	setActiveRoot(root: URI | undefined): void {
		this._overrideRoot = root;
		void this.refresh().then(() => this._scheduleAutoIndex('active-root'));
	}

	getIndexDirFsPath(): string | undefined {
		const root = this._resolveRootFsPath();
		return root ? droxCodebaseIndexDir(root) : undefined;
	}

	async refresh(): Promise<void> {
		const rootUri = this._resolveRootUri();
		const root = rootUri?.fsPath;
		if (!root || !rootUri) {
			this._snapshot = {
				...createEmptyCodebaseSnapshot(),
				state: 'missing',
				alerts: [{
					id: 'no-root',
					severity: 'info',
					code: 'NO_WORKSPACE_ROOT',
					message: 'Open a folder to enable the codebase index.',
					at: Date.now(),
				}],
			};
			this._onDidChangeSnapshot.fire();
			return;
		}

		const manifest = await this.indexService.getManifest(rootUri);
		const base = createEmptyCodebaseSnapshot(root);
		const hasVectors = !!(manifest && manifest.vectors > 0);
		const embedMeta = await this._resolveEmbedMeta(this._snapshot.embed);
		const indexAlerts = manifest ? [] : [{
			id: 'no-index',
			severity: 'info' as const,
			code: 'NO_INDEX',
			message: 'No index yet — click Reindex.',
			at: Date.now(),
		}];
		// Embed alerts are applied after refreshEmbedStatus (auto-load) to avoid stale "not loaded yet".
		const pipelineView = buildDroxCodebasePipelineView(this._pipelineEvents);
		const last = this._pipelineEvents[this._pipelineEvents.length - 1];
		this._snapshot = {
			...base,
			state: 'idle',
			storage: manifest
				? {
					files: manifest.files,
					chunks: manifest.chunks,
					vectors: manifest.vectors,
					bytes: manifest.bytes,
					softCapBytes: base.storage.softCapBytes,
				}
				: base.storage,
			embed: embedMeta,
			mode: hasVectors || embedMeta.loaded ? 'hybrid' : 'lexical',
			alerts: indexAlerts,
			pipeline: {
				queueDepth: 0,
				chunksPerSec: 0,
				phase: pipelineView.currentMessage,
				currentPath: last?.path,
				progressPct: pipelineView.progressPct,
				runId: pipelineView.runId,
				trigger: pipelineView.trigger,
			},
			pipelineView,
		};
		this._onDidChangeSnapshot.fire();
		await this.refreshEmbedStatus();
	}

	async refreshEmbedStatus(): Promise<void> {
		try {
			const st = await this._embedClient.status();
			const hasVectors = this._snapshot.storage.vectors > 0;
			const embed = await this._resolveEmbedMeta({
				loaded: st.modelLoaded,
				modelId: st.modelPath ?? (st.built ? `${DROX_EMBED_DEFAULT_MODEL_LABEL} · ${st.backend}` : undefined),
				dimensions: st.dimensions,
				backend: st.backend,
				built: st.built,
				rssBytes: undefined,
				lastProbeMs: undefined,
			});
			// Auto-load default/custom GGUF when runtime is built but nothing loaded yet.
			if (st.built && !st.modelLoaded && embed.resolvedPath) {
				try {
					await this._embedClient.load(embed.resolvedPath);
					const after = await this._embedClient.status();
					const loadedEmbed = await this._resolveEmbedMeta({
						loaded: after.modelLoaded,
						modelId: after.modelPath ?? DROX_EMBED_DEFAULT_MODEL_LABEL,
						dimensions: after.dimensions,
						backend: after.backend,
						built: after.built,
					});
					await this._applyEmbedSnapshot(loadedEmbed, after.modelLoaded || hasVectors ? 'hybrid' : 'lexical');
					return;
				} catch (loadErr) {
					this.logService.trace(`[drox-codebase] auto embed.load failed: ${loadErr}`);
				}
			}
			await this._applyEmbedSnapshot(embed, (st.built && st.modelLoaded) || hasVectors ? 'hybrid' : 'lexical');
		} catch (err) {
			this.logService.trace(`[drox-codebase] embed.status failed: ${err}`);
		}
	}

	async setEmbedModelPath(path: string): Promise<void> {
		const trimmed = path.trim();
		await this.configurationService.updateValue(DroxSetting.CodebaseEmbedModelPath, trimmed, ConfigurationTarget.USER);
		if (trimmed) {
			try {
				await this._embedClient.load(trimmed);
			} catch (err) {
				this.logService.warn(`[drox-codebase] embed.load custom path failed: ${err}`);
			}
		}
		await this.refresh();
	}

	async resetEmbedDefaults(): Promise<void> {
		await this.configurationService.updateValue(DroxSetting.CodebaseEmbedModelPath, '', ConfigurationTarget.USER);
		const resolved = await resolveDroxEmbedModelPathDetailed(this.fileService, {
			customPath: undefined,
			modelId: DROX_EMBED_DEFAULT_MODEL_ID,
			appRoot: this.environmentService.appRoot,
			userDataPath: this.environmentService.userDataPath,
		});
		if (resolved.path) {
			try {
				await this._embedClient.load(resolved.path);
			} catch (err) {
				this.logService.warn(`[drox-codebase] embed.load default failed: ${err}`);
			}
		}
		await this.refresh();
	}

	async reindex(): Promise<void> {
		const root = this._resolveRootUri();
		if (!root) {
			return;
		}
		this._snapshot = { ...this._snapshot, state: 'indexing', pipeline: { queueDepth: 0, chunksPerSec: 0, phase: 'scan+chunk' } };
		this._onDidChangeSnapshot.fire();
		try {
			await this.indexService.ensureIndexed(root);
			await this.refresh();
		} catch (err) {
			this._snapshot = {
				...this._snapshot,
				state: 'error',
				lastError: err instanceof Error ? err.message : String(err),
				alerts: [{
					id: 'index-error',
					severity: 'error',
					code: 'INDEX_FAILED',
					message: err instanceof Error ? err.message : String(err),
					at: Date.now(),
				}],
			};
			this._onDidChangeSnapshot.fire();
		}
	}

	pause(): void {
		const root = this._resolveRootUri();
		if (root) {
			this.indexService.pause(root);
		}
		this._snapshot = { ...this._snapshot, state: 'paused' };
		this._onDidChangeSnapshot.fire();
	}

	resume(): void {
		const root = this._resolveRootUri();
		if (root) {
			this.indexService.resume(root);
		}
		void this.refresh().then(() => this._scheduleAutoIndex('resume'));
	}

	async purge(): Promise<void> {
		const root = this._resolveRootUri();
		if (!root) {
			return;
		}
		await this.indexService.purge(root);
		await this.refresh();
		this._scheduleAutoIndex('after-purge');
	}

	async probeRetrieval(query: string): Promise<readonly IDroxCodebaseHit[]> {
		const root = this._resolveRootUri();
		if (!root || !query.trim()) {
			return [];
		}
		const hits = await this.indexService.search(root, query, { includeLexical: true });
		this._lastProbeHits = hits;
		return hits;
	}

	clearPipelineLog(): void {
		this._pipelineEvents.length = 0;
		this._publishPipelineView();
	}

	buildDiagnosticsExport(lastProbeHits?: readonly IDroxCodebaseHit[]): IDroxCodebaseDiagExport {
		const pipeline = buildDroxCodebasePipelineView(this._pipelineEvents);
		return {
			exportedAt: new Date().toISOString(),
			snapshot: this._snapshot,
			pipeline,
			lastProbeHits: lastProbeHits ?? this._lastProbeHits,
		};
	}

	/** CB2b: background ensureIndexed (hash-skip) without blocking UI. */
	private _scheduleAutoIndex(reason: string): void {
		const root = this._resolveRootUri();
		if (!root || this._autoIndexInFlight || this._snapshot.state === 'paused') {
			return;
		}
		this._autoIndexInFlight = true;
		this._snapshot = {
			...this._snapshot,
			state: this._snapshot.storage.chunks > 0 ? this._snapshot.state : 'indexing',
			pipeline: { ...this._snapshot.pipeline, phase: `auto:${reason}` },
		};
		this._onDidChangeSnapshot.fire();
		void (async () => {
			try {
				if (this._snapshot.state !== 'indexing') {
					this._snapshot = { ...this._snapshot, state: 'indexing', pipeline: { ...this._snapshot.pipeline, phase: `auto:${reason}` } };
					this._onDidChangeSnapshot.fire();
				}
				await this.indexService.ensureIndexed(root);
				await this.refresh();
			} catch (err) {
				this.logService.warn(`[drox-codebase] auto-index (${reason}) failed: ${err}`);
				this._snapshot = {
					...this._snapshot,
					state: 'error',
					lastError: err instanceof Error ? err.message : String(err),
				};
				this._onDidChangeSnapshot.fire();
			} finally {
				this._autoIndexInFlight = false;
			}
		})();
	}

	private _queueInvalidate(uri: URI): void {
		const root = this._resolveRootUri();
		if (!root) {
			return;
		}
		const rel = relativePath(root, uri);
		if (!rel) {
			return;
		}
		const norm = rel.replace(/\\/g, '/');
		if (norm.startsWith('.drox/') || norm.split('/').some(seg => droxCodebaseShouldSkipDirName(seg))) {
			return;
		}
		const base = norm.includes('/') ? norm.slice(norm.lastIndexOf('/') + 1) : norm;
		if (droxCodebaseShouldSkipFileName(base)) {
			return;
		}
		this._pendingInvalidate.add(uri.toString());
		this._invalidateScheduler.schedule();
	}

	private async _flushInvalidations(): Promise<void> {
		const root = this._resolveRootUri();
		if (!root || this._pendingInvalidate.size === 0) {
			return;
		}
		const uris = [...this._pendingInvalidate].map(s => URI.parse(s));
		this._pendingInvalidate.clear();
		try {
			this._snapshot = { ...this._snapshot, state: 'indexing', pipeline: { ...this._snapshot.pipeline, phase: 'incremental' } };
			this._onDidChangeSnapshot.fire();
			await this.indexService.invalidate(root, uris);
			await this.refresh();
		} catch (err) {
			this.logService.warn(`[drox-codebase] incremental invalidate failed: ${err}`);
			await this.refresh();
		}
	}

	private _publishPipelineView(): void {
		const pipelineView = this._pipelineEvents.length
			? buildDroxCodebasePipelineView(this._pipelineEvents)
			: createEmptyPipelineView();
		const last = this._pipelineEvents[this._pipelineEvents.length - 1];
		const indexing = !!(last && (
			(last.kind !== 'run_done' && last.kind !== 'error' && last.status === 'running')
			|| (last.kind !== 'run_done' && last.kind !== 'error' && this._autoIndexInFlight)
		));
		this._snapshot = {
			...this._snapshot,
			state: indexing && this._snapshot.state !== 'paused' && this._snapshot.state !== 'error'
				? 'indexing'
				: (this._snapshot.state === 'indexing' && (last?.kind === 'run_done' || last?.kind === 'error')
					? (last.kind === 'error' ? 'error' : 'idle')
					: this._snapshot.state),
			pipeline: {
				queueDepth: this._pendingInvalidate.size,
				chunksPerSec: this._snapshot.pipeline.chunksPerSec,
				phase: pipelineView.currentMessage,
				currentPath: last?.path,
				progressPct: pipelineView.progressPct,
				runId: pipelineView.runId,
				trigger: pipelineView.trigger,
			},
			pipelineView,
		};
		this._onDidChangeSnapshot.fire();
	}

	private async _applyEmbedSnapshot(
		embed: IDroxCodebaseEmbedStats,
		mode: IDroxCodebaseCockpitSnapshot['mode'],
	): Promise<void> {
		const nonEmbedAlerts = this._snapshot.alerts.filter(a => !a.id.startsWith('embed-'));
		const embedAlerts = await this._probeEmbedAlert();
		this._snapshot = {
			...this._snapshot,
			embed,
			mode,
			alerts: [...nonEmbedAlerts, ...embedAlerts],
			pipelineView: this._snapshot.pipelineView ?? createEmptyPipelineView(),
		};
		this._onDidChangeSnapshot.fire();
	}

	private async _resolveEmbedMeta(partial: IDroxCodebaseEmbedStats): Promise<IDroxCodebaseEmbedStats> {
		const customPathSetting = (this.configurationService.getValue<string>(DroxSetting.CodebaseEmbedModelPath) ?? '').trim();
		const resolved = await resolveDroxEmbedModelPathDetailed(this.fileService, {
			customPath: customPathSetting || undefined,
			modelId: DROX_EMBED_DEFAULT_MODEL_ID,
			appRoot: this.environmentService.appRoot,
			userDataPath: this.environmentService.userDataPath,
		});
		return {
			...partial,
			resolvedPath: resolved.path,
			source: resolved.source,
			customPathSetting: customPathSetting || undefined,
			modelId: partial.modelId ?? (resolved.path ? DROX_EMBED_DEFAULT_MODEL_LABEL : undefined),
		};
	}

	private async _probeEmbedAlert(): Promise<IDroxCodebaseCockpitSnapshot['alerts']> {
		try {
			const st = await this._embedClient.status();
			if (!st.built) {
				return [{
					id: 'embed-not-built',
					severity: 'info',
					code: 'EMBED_NOT_BUILT',
					message: 'Embed runtime not in this drox.exe — rebuild with --features embed (CB2).',
					at: Date.now(),
				}];
			}
			const resolved = await resolveDroxEmbedModelPathDetailed(this.fileService, {
				customPath: (this.configurationService.getValue<string>(DroxSetting.CodebaseEmbedModelPath) ?? '').trim() || undefined,
				appRoot: this.environmentService.appRoot,
				userDataPath: this.environmentService.userDataPath,
			});
			if (!resolved.path) {
				return [{
					id: 'embed-no-model-file',
					severity: 'warn',
					code: 'EMBED_MODEL_MISSING',
					message: `Default MiniLM GGUF not found (expected under resources/drox/models/${DROX_EMBED_DEFAULT_MODEL_ID}). Package the model with the app or set a custom path.`,
					at: Date.now(),
				}];
			}
			if (!st.modelLoaded) {
				return [{
					id: 'embed-no-model',
					severity: 'warn',
					code: 'EMBED_NO_MODEL',
					message: `GGUF found (${resolved.source}) but failed to load — check the path or click Reindex.`,
					at: Date.now(),
				}];
			}
		} catch {
			return [{
				id: 'embed-unreachable',
				severity: 'warn',
				code: 'EMBED_UNREACHABLE',
				message: 'Could not query embed.status on drox.exe.',
				at: Date.now(),
			}];
		}
		return [];
	}

	private _resolveRootUri(): URI | undefined {
		if (this._overrideRoot) {
			return this._overrideRoot;
		}
		const folder = this.workspaceContextService.getWorkspace().folders[0];
		return folder?.uri;
	}

	private _resolveRootFsPath(): string | undefined {
		return this._resolveRootUri()?.fsPath;
	}
}
