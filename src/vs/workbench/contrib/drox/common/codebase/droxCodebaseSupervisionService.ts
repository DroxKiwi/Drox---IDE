/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { FileChangeType, IFileService } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { DroxSetting } from '../droxConfiguration.js';
import { IDroxEngineService } from '../droxEngineService.js';
import { DroxCodebaseEmbedClient } from './droxCodebaseEmbedClient.js';
import { IDroxCodebaseContextService } from './droxCodebaseContextService.js';
import { IDroxCodebaseIndexService } from './droxCodebaseIndexService.js';
import { droxCodebaseIndexDir } from './droxCodebasePaths.js';
import { createEmptyCodebaseSnapshot, buildDroxCodebasePipelineView, IDroxCodebaseCockpitSnapshot, IDroxCodebaseDiagExport, IDroxCodebaseHit, IDroxCodebaseLastInject, IDroxCodebasePipelineEvent } from './droxCodebaseTypes.js';
import { IDroxCodebaseCatalog, IDroxCodebaseCompactResult } from './droxCodebaseCatalog.js';
import { DroxCodebaseAutoIndex } from './supervision/droxCodebaseAutoIndex.js';
import { droxCodebaseInvalidateRelativePath } from './supervision/droxCodebaseFileWatcher.js';
import { DroxCodebasePipelineLog } from './supervision/droxCodebasePipelineLog.js';
import {
	applyDroxCodebaseEmbedToSnapshot,
	probeDroxCodebaseEmbedAlerts,
	refreshDroxCodebaseEmbedStatus,
	resetDroxCodebaseEmbedDefaults,
	resolveDroxCodebaseEmbedMeta,
	setDroxCodebaseEmbedModelPath,
} from './supervision/droxCodebaseSupervisionEmbed.js';
import { buildDroxCodebaseEmbedIssueAlerts } from './supervision/droxCodebaseEmbedIssueAlerts.js';
import { buildDroxCodebaseRootAlerts } from './supervision/droxCodebaseRootAlerts.js';

/** Debounce for CB2b file-watcher incremental updates (ms). */
const CB2B_INVALIDATE_DEBOUNCE_MS = 600;
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
	refreshEmbedStatus(): Promise<void>;
	setEmbedModelPath(path: string): Promise<void>;
	resetEmbedDefaults(): Promise<void>;
	clearPipelineLog(): void;
	buildDiagnosticsExport(lastProbeHits?: readonly IDroxCodebaseHit[]): IDroxCodebaseDiagExport;
	readonly lastInject: IDroxCodebaseLastInject | undefined;
	/** CB3b catalogue admin */
	listCatalog(): Promise<IDroxCodebaseCatalog>;
	deleteCatalogPaths(relativePaths: readonly string[]): Promise<{ removedChunks: number; removedVectors: number }>;
	compactCatalog(): Promise<IDroxCodebaseCompactResult>;
	listExclusions(): Promise<readonly string[]>;
	setExclusions(globs: readonly string[]): Promise<readonly string[]>;
	excludeCatalogPaths(relativePathsOrGlobs: readonly string[]): Promise<{ globs: readonly string[]; removedChunks: number; removedVectors: number }>;
	rebuildCatalogPaths(relativePaths: readonly string[]): Promise<void>;
}

export class DroxCodebaseSupervisionService extends Disposable implements IDroxCodebaseSupervisionService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSnapshot = this._register(new Emitter<void>());
	readonly onDidChangeSnapshot = this._onDidChangeSnapshot.event;

	private readonly _embedClient: DroxCodebaseEmbedClient;
	private readonly _autoIndex: DroxCodebaseAutoIndex;
	private _overrideRoot: URI | undefined;
	private _snapshot: IDroxCodebaseCockpitSnapshot = createEmptyCodebaseSnapshot();
	private readonly _pendingInvalidate = new Set<string>();
	private readonly _invalidateScheduler: RunOnceScheduler;
	private readonly _pipelineLog = new DroxCodebasePipelineLog();
	private readonly _pipelineUiScheduler: RunOnceScheduler;
	private _lastProbeHits: readonly IDroxCodebaseHit[] = [];

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IDroxCodebaseIndexService private readonly indexService: IDroxCodebaseIndexService,
		@IDroxCodebaseContextService private readonly contextService: IDroxCodebaseContextService,
		@IDroxEngineService engineService: IDroxEngineService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
	) {
		super();
		this._embedClient = new DroxCodebaseEmbedClient(engineService);
		this._autoIndex = new DroxCodebaseAutoIndex(
			indexService,
			logService,
			() => this._resolveRootUri(),
			() => this._snapshot,
			s => { this._snapshot = s; },
			() => this._onDidChangeSnapshot.fire(),
			() => this.refresh(),
		);
		this._invalidateScheduler = this._register(new RunOnceScheduler(() => {
			void this._flushInvalidations();
		}, CB2B_INVALIDATE_DEBOUNCE_MS));
		this._pipelineUiScheduler = this._register(new RunOnceScheduler(() => {
			this._publishPipelineView();
		}, PIPELINE_UI_THROTTLE_MS));
		this._register(this.indexService.onDidPipelineEvent(ev => {
			this._pipelineLog.push(ev);
			if (ev.kind === 'run_done' || ev.kind === 'error' || ev.status === 'error') {
				this._publishPipelineView();
			} else {
				this._pipelineUiScheduler.schedule();
			}
		}));
		this._register(this.contextService.onDidInject(rec => {
			this._pipelineLog.push(injectToPipelineEvent(rec, this._resolveRootUri()?.fsPath));
			this._publishPipelineView();
		}));
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			void this.refresh().then(() => this._autoIndex.schedule('workspace-folders'));
		}));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(DroxSetting.CodebaseEmbedModelPath)) {
				void this.refreshEmbedStatus();
			}
			if (e.affectsConfiguration(DroxSetting.CodebaseAutoInject)) {
				this._onDidChangeSnapshot.fire();
			}
		}));
		this._register(this.fileService.onDidFilesChange(e => {
			if (!this._resolveRootUri()) {
				return;
			}
			for (const uri of [...e.rawAdded, ...e.rawUpdated, ...e.rawDeleted]) {
				if (e.contains(uri, FileChangeType.ADDED, FileChangeType.UPDATED, FileChangeType.DELETED)) {
					this._queueInvalidate(uri);
				}
			}
		}));
		void this.refresh().then(() => this._autoIndex.schedule('startup'));
	}

	get lastInject(): IDroxCodebaseLastInject | undefined {
		return this.contextService.lastInject;
	}

	get snapshot(): IDroxCodebaseCockpitSnapshot {
		return this._snapshot;
	}

	setActiveRoot(root: URI | undefined): void {
		this._overrideRoot = root;
		this._pipelineLog.setActiveRoot(root?.fsPath);
		// Index immediately on open / switch — do not wait for refresh (first-time
		// folders must start ensureIndexed ASAP; hash-skip is cheap if already done).
		if (root) {
			this._autoIndex.schedule('active-root');
		}
		void this.refresh();
	}

	getIndexDirFsPath(): string | undefined {
		const root = this._resolveRootUri()?.fsPath;
		return root ? droxCodebaseIndexDir(root) : undefined;
	}

	async refresh(): Promise<void> {
		const rootUri = this._resolveRootUri();
		const root = rootUri?.fsPath;
		if (!root || !rootUri) {
			this._pipelineLog.setActiveRoot(undefined);
			this._snapshot = {
				...createEmptyCodebaseSnapshot(),
				state: 'missing',
				alerts: [...buildDroxCodebaseRootAlerts({ hasRoot: false, manifest: undefined })],
			};
			this._onDidChangeSnapshot.fire();
			return;
		}

		const manifest = await this.indexService.getManifest(rootUri);
		const base = createEmptyCodebaseSnapshot(root);
		const hasVectors = !!(manifest && manifest.vectors > 0);
		const embedMeta = await resolveDroxCodebaseEmbedMeta(
			this.fileService, this.configurationService, this.environmentService, this._snapshot.embed,
		);
		this._pipelineLog.setActiveRoot(root);
		const events = this._pipelineLog.events;
		const pipelineView = buildDroxCodebasePipelineView(events);
		const last = events[events.length - 1];
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
			// Hybrid only when embed runtime can encode queries (matches search fallback).
			mode: hasVectors && embedMeta.built && embedMeta.loaded ? 'hybrid' : 'lexical',
			alerts: [
				...buildDroxCodebaseRootAlerts({ hasRoot: true, manifest }),
				...buildDroxCodebaseEmbedIssueAlerts(events),
			],
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
		// First open of a never-indexed folder: ensure auto-index is armed even if
		// the earlier schedule was skipped (e.g. pause bleed from another root).
		if (!manifest && this._snapshot.state !== 'paused' && !this._autoIndex.inFlight) {
			this._autoIndex.schedule('missing-index');
		}
	}

	async refreshEmbedStatus(): Promise<void> {
		await refreshDroxCodebaseEmbedStatus({
			embedClient: this._embedClient,
			fileService: this.fileService,
			configurationService: this.configurationService,
			environmentService: this.environmentService,
			logService: this.logService,
			snapshot: this._snapshot,
			apply: (embed, mode) => this._applyEmbedSnapshot(embed, mode),
		});
	}

	async setEmbedModelPath(path: string): Promise<void> {
		await setDroxCodebaseEmbedModelPath({
			embedClient: this._embedClient,
			configurationService: this.configurationService,
			logService: this.logService,
			path,
			refresh: () => this.refresh(),
		});
	}

	async resetEmbedDefaults(): Promise<void> {
		await resetDroxCodebaseEmbedDefaults({
			embedClient: this._embedClient,
			fileService: this.fileService,
			configurationService: this.configurationService,
			environmentService: this.environmentService,
			logService: this.logService,
			refresh: () => this.refresh(),
		});
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
		void this.refresh().then(() => this._autoIndex.schedule('resume'));
	}

	async purge(): Promise<void> {
		const root = this._resolveRootUri();
		if (!root) {
			return;
		}
		await this.indexService.purge(root);
		await this.refresh();
		this._autoIndex.schedule('after-purge');
	}

	async listCatalog(): Promise<IDroxCodebaseCatalog> {
		const root = this._resolveRootUri();
		if (!root) {
			return { files: [], totalFiles: 0, totalChunks: 0, totalVectors: 0, textBytes: 0 };
		}
		return this.indexService.listCatalog(root);
	}

	async deleteCatalogPaths(relativePaths: readonly string[]): Promise<{ removedChunks: number; removedVectors: number }> {
		const root = this._resolveRootUri();
		if (!root || !relativePaths.length) {
			return { removedChunks: 0, removedVectors: 0 };
		}
		const result = await this.indexService.deleteIndexedPaths(root, relativePaths);
		await this.refresh();
		return result;
	}

	async compactCatalog(): Promise<IDroxCodebaseCompactResult> {
		const root = this._resolveRootUri();
		if (!root) {
			return { bytesBefore: 0, bytesAfter: 0, files: 0, chunks: 0, vectors: 0, orphanVectorsRemoved: 0 };
		}
		const result = await this.indexService.compactStore(root);
		await this.refresh();
		return result;
	}

	async listExclusions(): Promise<readonly string[]> {
		const root = this._resolveRootUri();
		if (!root) {
			return [];
		}
		return this.indexService.listExclusions(root);
	}

	async setExclusions(globs: readonly string[]): Promise<readonly string[]> {
		const root = this._resolveRootUri();
		if (!root) {
			return [];
		}
		const next = await this.indexService.setExclusions(root, globs);
		await this.refresh();
		return next;
	}

	async excludeCatalogPaths(relativePathsOrGlobs: readonly string[]): Promise<{ globs: readonly string[]; removedChunks: number; removedVectors: number }> {
		const root = this._resolveRootUri();
		if (!root || !relativePathsOrGlobs.length) {
			return { globs: [], removedChunks: 0, removedVectors: 0 };
		}
		const result = await this.indexService.excludePaths(root, relativePathsOrGlobs);
		await this.refresh();
		return result;
	}

	async rebuildCatalogPaths(relativePaths: readonly string[]): Promise<void> {
		const root = this._resolveRootUri();
		if (!root || !relativePaths.length) {
			return;
		}
		this._snapshot = { ...this._snapshot, state: 'indexing', pipeline: { ...this._snapshot.pipeline, phase: 'rebuild' } };
		this._onDidChangeSnapshot.fire();
		try {
			await this.indexService.rebuildIndexedPaths(root, relativePaths);
			await this.refresh();
		} catch (err) {
			this._snapshot = {
				...this._snapshot,
				state: 'error',
				lastError: err instanceof Error ? err.message : String(err),
			};
			this._onDidChangeSnapshot.fire();
			throw err;
		}
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
		this._pipelineLog.clear();
		this._publishPipelineView();
	}

	buildDiagnosticsExport(lastProbeHits?: readonly IDroxCodebaseHit[]): IDroxCodebaseDiagExport {
		return {
			exportedAt: new Date().toISOString(),
			snapshot: this._snapshot,
			pipeline: buildDroxCodebasePipelineView(this._pipelineLog.events),
			lastProbeHits: lastProbeHits ?? this._lastProbeHits,
			lastInject: this.contextService.lastInject,
		};
	}

	private _queueInvalidate(uri: URI): void {
		const root = this._resolveRootUri();
		if (!root || !droxCodebaseInvalidateRelativePath(root, uri)) {
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
		const next = this._pipelineLog.publishIntoSnapshot(this._snapshot, {
			queueDepth: this._pendingInvalidate.size,
			autoIndexInFlight: this._autoIndex.inFlight,
		});
		const rootAlerts = next.alerts.filter(a =>
			!a.id.startsWith('index-embed-') && !a.id.startsWith('embed-'),
		);
		const embedRuntimeAlerts = next.alerts.filter(a => a.id.startsWith('embed-'));
		this._snapshot = {
			...next,
			alerts: [
				...rootAlerts,
				...buildDroxCodebaseEmbedIssueAlerts(next.pipelineView.events),
				...embedRuntimeAlerts,
			],
		};
		this._onDidChangeSnapshot.fire();
	}

	private async _applyEmbedSnapshot(
		embed: import('./droxCodebaseTypes.js').IDroxCodebaseEmbedStats,
		mode: IDroxCodebaseCockpitSnapshot['mode'],
	): Promise<void> {
		const embedAlerts = await probeDroxCodebaseEmbedAlerts(
			this._embedClient, this.fileService, this.configurationService, this.environmentService,
		);
		const next = applyDroxCodebaseEmbedToSnapshot(this._snapshot, embed, mode, embedAlerts);
		if (embedSnapshotUnchanged(this._snapshot, next)) {
			return;
		}
		this._snapshot = next;
		this._onDidChangeSnapshot.fire();
	}

	private _resolveRootUri(): URI | undefined {
		return this._overrideRoot ?? this.workspaceContextService.getWorkspace().folders[0]?.uri;
	}
}

function embedSnapshotUnchanged(prev: IDroxCodebaseCockpitSnapshot, next: IDroxCodebaseCockpitSnapshot): boolean {
	const pe = prev.embed;
	const ne = next.embed;
	if (prev.mode !== next.mode) {
		return false;
	}
	if (pe.loaded !== ne.loaded || pe.built !== ne.built || pe.backend !== ne.backend
		|| pe.dimensions !== ne.dimensions || pe.resolvedPath !== ne.resolvedPath
		|| pe.source !== ne.source || pe.modelId !== ne.modelId
		|| pe.modelFileBytes !== ne.modelFileBytes || pe.rssBytes !== ne.rssBytes) {
		return false;
	}
	if (prev.alerts.length !== next.alerts.length) {
		return false;
	}
	for (let i = 0; i < prev.alerts.length; i++) {
		if (prev.alerts[i]!.id !== next.alerts[i]!.id || prev.alerts[i]!.code !== next.alerts[i]!.code) {
			return false;
		}
	}
	return true;
}

function injectToPipelineEvent(rec: IDroxCodebaseLastInject, rootFsPath?: string): IDroxCodebasePipelineEvent {
	const status = rec.skip === 'error' || rec.skip === 'timeout'
		? 'warn' as const
		: (rec.hitCount > 0 ? 'ok' as const : 'warn' as const);
	const message = rec.skip
		? `Inject ${rec.forced ? 'forced' : 'auto'} — ${rec.skip}`
		: `Inject ${rec.forced ? 'forced' : 'auto'} — ${rec.hitCount} hits · ${rec.chars} chars`;
	return {
		id: `inj-${rec.at}`,
		at: rec.at,
		runId: `inject-${rec.at}`,
		kind: 'search',
		status,
		message,
		rootFsPath,
		detail: {
			source: rec.forced ? 'force_inject' : 'auto_inject',
			hits: rec.hitCount,
			chars: rec.chars,
			ms: rec.ms,
			skip: rec.skip,
			query: rec.query.slice(0, 80),
		},
	};
}
