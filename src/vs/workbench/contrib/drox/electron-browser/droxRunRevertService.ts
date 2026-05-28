/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { join } from '../../../../base/common/path.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { normalizeWindowsFsPath } from '../common/droxPathUtil.js';
import {
	IDroxRunRevertCommit,
	IDroxRunRevertFileEntry,
	IDroxRunRevertResult,
	IDroxRunRevertService,
	IDroxRunRevertSnapshot,
} from '../common/droxRunRevertService.js';

interface IActiveRunAccumulator {
	runId: string;
	workspaceRoot: string;
	sessionId?: string;
	files: Map<string, IDroxRunRevertFileEntry>;
	firstMessageId?: string;
	lastMessageId?: string;
	messageIds: Set<string>;
}

interface IRunHistoryWire {
	version: 1;
	commits: IDroxRunRevertCommit[];
	messageToCommit: Record<string, string>;
}

const MAX_HISTORY_COMMITS = 250;
const MAX_HISTORY_BYTES = 32 * 1024 * 1024;

export class DroxRunRevertService extends Disposable implements IDroxRunRevertService {

	declare readonly _serviceBrand: undefined;

	private _active: IActiveRunAccumulator | undefined;
	private _lastRevertable: IDroxRunRevertSnapshot | undefined;
	private _historyFlush: Promise<void> = Promise.resolve();

	private readonly _onDidChangeRevertable = this._register(new Emitter<void>());
	readonly onDidChangeRevertable: Event<void> = this._onDidChangeRevertable.event;

	constructor(
		@IFileService private readonly fileService: IFileService,
	) {
		super();
	}

	beginRun(runId: string, workspaceRoot: string, sessionId?: string): void {
		this._active = {
			runId,
			workspaceRoot: normalizeWindowsFsPath(workspaceRoot),
			sessionId,
			files: new Map(),
			messageIds: new Set(),
		};
	}

	setRunFirstMessageId(runId: string, messageId: string): void {
		const active = this._active;
		if (!active || active.runId !== runId) {
			return;
		}
		const id = String(messageId || '').trim();
		if (!id) {
			return;
		}
		active.firstMessageId = id;
		active.lastMessageId = id;
		active.messageIds.add(id);
	}

	recordRunMessage(runId: string, messageId: string): void {
		const active = this._active;
		if (!active || active.runId !== runId) {
			return;
		}
		const id = String(messageId || '').trim();
		if (!id) {
			return;
		}
		if (!active.firstMessageId) {
			active.firstMessageId = id;
		}
		active.lastMessageId = id;
		active.messageIds.add(id);
	}

	async captureBeforeWrite(workspaceRoot: string, absPath: string): Promise<void> {
		const active = this._active;
		if (!active) {
			return;
		}
		const ws = normalizeWindowsFsPath(workspaceRoot);
		if (active.workspaceRoot !== ws) {
			return;
		}
		const key = normalizeWindowsFsPath(absPath);
		if (active.files.has(key)) {
			return;
		}
		const uri = URI.file(key);
		const exists = await this.fileService.exists(uri);
		let beforeContent = '';
		if (exists) {
			const read = await this.fileService.readFile(uri);
			beforeContent = read.value.toString();
		}
		active.files.set(key, {
			absPath: key,
			hadFile: exists,
			beforeContent,
		});
	}

	finalizeRun(runId: string): void {
		const active = this._active;
		if (!active || active.runId !== runId || active.files.size === 0) {
			this._active = undefined;
			return;
		}
		const commit: IDroxRunRevertCommit = {
			commitId: `rc_${generateUuid()}`,
			runId: active.runId,
			sessionId: active.sessionId,
			workspaceRoot: active.workspaceRoot,
			finishedAt: Date.now(),
			files: [...active.files.values()],
			firstMessageId: active.firstMessageId,
			lastMessageId: active.lastMessageId,
		};
		this._lastRevertable = commit;
		this._active = undefined;
		this._historyFlush = this._historyFlush.then(() => this.appendCommitToHistory(commit, active.messageIds));
		this._onDidChangeRevertable.fire();
	}

	discardActiveRun(): void {
		this._active = undefined;
	}

	getLastRevertable(): IDroxRunRevertSnapshot | undefined {
		return this._lastRevertable;
	}

	hasRevertable(): boolean {
		return !!this._lastRevertable && this._lastRevertable.files.length > 0;
	}

	async revertLastRun(): Promise<IDroxRunRevertResult> {
		const snap = this._lastRevertable;
		if (!snap || snap.files.length === 0) {
			return { revertedPaths: [], errors: ['No revertable run.'] };
		}
		const res = await this.applySnapshot(snap);
		this._lastRevertable = undefined;
		await this.dropCommitFromHistory(snap.workspaceRoot, snap.runId);
		this._onDidChangeRevertable.fire();
		return res;
	}

	async listRevertHistory(workspaceRoot: string, sessionId?: string): Promise<readonly IDroxRunRevertCommit[]> {
		await this._historyFlush;
		const ws = normalizeWindowsFsPath(workspaceRoot);
		const history = await this.readHistory(ws);
		if (!sessionId) {
			return history.commits;
		}
		return history.commits.filter(c => c.sessionId === sessionId);
	}

	async revertToMessage(workspaceRoot: string, messageId: string): Promise<IDroxRunRevertResult> {
		await this._historyFlush;
		if (this._active) {
			return { revertedPaths: [], errors: ['Cannot restore during an active run.'] };
		}
		const ws = normalizeWindowsFsPath(workspaceRoot);
		const wanted = String(messageId || '').trim();
		if (!wanted) {
			return { revertedPaths: [], errors: ['Missing target message id.'] };
		}
		const history = await this.readHistory(ws);
		const commitId = history.messageToCommit[wanted];
		if (!commitId) {
			return { revertedPaths: [], errors: [`No restore point for message ${wanted}.`] };
		}
		const commit = history.commits.find(c => c.commitId === commitId);
		if (!commit) {
			return { revertedPaths: [], errors: [`Restore point ${commitId} not found.`] };
		}
		const res = await this.applySnapshot(commit);
		this._lastRevertable = undefined;
		this._onDidChangeRevertable.fire();
		return res;
	}

	private async applySnapshot(snap: IDroxRunRevertSnapshot): Promise<IDroxRunRevertResult> {
		const revertedPaths: string[] = [];
		const errors: string[] = [];
		for (const entry of snap.files) {
			try {
				const uri = URI.file(entry.absPath);
				if (entry.hadFile) {
					await this.fileService.writeFile(uri, VSBuffer.fromString(entry.beforeContent));
				} else if (await this.fileService.exists(uri)) {
					await this.fileService.del(uri, { recursive: false });
				}
				revertedPaths.push(entry.absPath);
			} catch (e) {
				errors.push(`${entry.absPath}: ${e instanceof Error ? e.message : String(e)}`);
			}
		}
		return { revertedPaths, errors };
	}

	private historyPath(workspaceRoot: string): string {
		return join(workspaceRoot, '.drox', 'run-history', 'history.json');
	}

	private async readHistory(workspaceRoot: string): Promise<IRunHistoryWire> {
		const path = this.historyPath(workspaceRoot);
		const uri = URI.file(path);
		try {
			const raw = (await this.fileService.readFile(uri)).value.toString();
			const parsed = JSON.parse(raw) as Partial<IRunHistoryWire>;
			const commits = Array.isArray(parsed.commits) ? parsed.commits : [];
			const messageToCommit =
				parsed.messageToCommit && typeof parsed.messageToCommit === 'object'
					? parsed.messageToCommit as Record<string, string>
					: {};
			return { version: 1, commits, messageToCommit };
		} catch {
			return { version: 1, commits: [], messageToCommit: {} };
		}
	}

	private async writeHistory(workspaceRoot: string, history: IRunHistoryWire): Promise<void> {
		const path = this.historyPath(workspaceRoot);
		const uri = URI.file(path);
		await this.fileService.createFolder(URI.file(join(workspaceRoot, '.drox', 'run-history')));
		const txt = JSON.stringify(history);
		await this.fileService.writeFile(uri, VSBuffer.fromString(txt));
	}

	private estimateCommitSize(commit: IDroxRunRevertCommit): number {
		let total = 0;
		for (const file of commit.files) {
			total += file.beforeContent.length + file.absPath.length + 64;
		}
		return total + 256;
	}

	private pruneHistory(history: IRunHistoryWire): void {
		while (history.commits.length > MAX_HISTORY_COMMITS) {
			history.commits.shift();
		}
		let bytes = history.commits.reduce((n, c) => n + this.estimateCommitSize(c), 0);
		while (history.commits.length > 1 && bytes > MAX_HISTORY_BYTES) {
			const removed = history.commits.shift();
			if (!removed) {
				break;
			}
			bytes -= this.estimateCommitSize(removed);
		}
		const valid = new Set(history.commits.map(c => c.commitId));
		for (const key of Object.keys(history.messageToCommit)) {
			if (!valid.has(history.messageToCommit[key])) {
				delete history.messageToCommit[key];
			}
		}
	}

	private async appendCommitToHistory(commit: IDroxRunRevertCommit, messageIds: Set<string>): Promise<void> {
		try {
			const ws = commit.workspaceRoot;
			const history = await this.readHistory(ws);
			history.commits.push(commit);
			for (const id of messageIds) {
				history.messageToCommit[id] = commit.commitId;
			}
			this.pruneHistory(history);
			await this.writeHistory(ws, history);
		} catch {
			// best-effort: l'historique ne doit pas casser le run
		}
	}

	private async dropCommitFromHistory(workspaceRoot: string, runId: string): Promise<void> {
		try {
			const ws = normalizeWindowsFsPath(workspaceRoot);
			const history = await this.readHistory(ws);
			history.commits = history.commits.filter(c => c.runId !== runId);
			this.pruneHistory(history);
			await this.writeHistory(ws, history);
		} catch {
			// best-effort
		}
	}
}
