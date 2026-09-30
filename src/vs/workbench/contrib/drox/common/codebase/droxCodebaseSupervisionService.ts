/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IDroxCodebaseIndexService } from './droxCodebaseIndexService.js';
import { droxCodebaseIndexDir } from './droxCodebasePaths.js';
import { createEmptyCodebaseSnapshot, IDroxCodebaseCockpitSnapshot, IDroxCodebaseHit } from './droxCodebaseTypes.js';

export const IDroxCodebaseSupervisionService = createDecorator<IDroxCodebaseSupervisionService>('droxCodebaseSupervisionService');

export interface IDroxCodebaseSupervisionService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSnapshot: Event<void>;
	readonly snapshot: IDroxCodebaseCockpitSnapshot;
	/** Active root for cockpit (IDE folders[0] by default; Agents may override later). */
	setActiveRoot(root: URI | undefined): void;
	refresh(): Promise<void>;
	reindex(): Promise<void>;
	pause(): void;
	resume(): void;
	purge(): Promise<void>;
	probeRetrieval(query: string): Promise<readonly IDroxCodebaseHit[]>;
	getIndexDirFsPath(): string | undefined;
}

/**
 * CB1 stub: binds cockpit to folders[0], reports missing/idle, no embed yet.
 * Real indexing lands in subsequent CB1 commits.
 */
export class DroxCodebaseSupervisionService extends Disposable implements IDroxCodebaseSupervisionService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSnapshot = this._register(new Emitter<void>());
	readonly onDidChangeSnapshot = this._onDidChangeSnapshot.event;

	private _overrideRoot: URI | undefined;
	private _snapshot: IDroxCodebaseCockpitSnapshot = createEmptyCodebaseSnapshot();

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IDroxCodebaseIndexService private readonly indexService: IDroxCodebaseIndexService,
	) {
		super();
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => {
			void this.refresh();
		}));
		void this.refresh();
	}

	get snapshot(): IDroxCodebaseCockpitSnapshot {
		return this._snapshot;
	}

	setActiveRoot(root: URI | undefined): void {
		this._overrideRoot = root;
		void this.refresh();
	}

	getIndexDirFsPath(): string | undefined {
		const root = this._resolveRootFsPath();
		return root ? droxCodebaseIndexDir(root) : undefined;
	}

	async refresh(): Promise<void> {
		const root = this._resolveRootFsPath();
		this._snapshot = {
			...createEmptyCodebaseSnapshot(root),
			state: root ? 'idle' : 'missing',
			embed: { loaded: false, modelId: undefined },
			mode: 'lexical',
			alerts: root ? [] : [{
				id: 'no-root',
				severity: 'info',
				code: 'NO_WORKSPACE_ROOT',
				message: 'Open a folder to enable the codebase index.',
				at: Date.now(),
			}],
		};
		this._onDidChangeSnapshot.fire();
	}

	async reindex(): Promise<void> {
		const root = this._resolveRootUri();
		if (!root) {
			return;
		}
		this._snapshot = { ...this._snapshot, state: 'indexing', pipeline: { ...this._snapshot.pipeline, phase: 'ensure' } };
		this._onDidChangeSnapshot.fire();
		try {
			await this.indexService.ensureIndexed(root);
			await this.refresh();
		} catch (err) {
			this._snapshot = {
				...this._snapshot,
				state: 'error',
				lastError: err instanceof Error ? err.message : String(err),
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
		void this.refresh();
	}

	async purge(): Promise<void> {
		const root = this._resolveRootUri();
		if (!root) {
			return;
		}
		await this.indexService.purge(root);
		await this.refresh();
	}

	async probeRetrieval(query: string): Promise<readonly IDroxCodebaseHit[]> {
		const root = this._resolveRootUri();
		if (!root || !query.trim()) {
			return [];
		}
		return this.indexService.search(root, query, { includeLexical: true });
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
