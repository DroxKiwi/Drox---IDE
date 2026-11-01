/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDroxEngineService } from '../../common/droxEngineService.js';
import { IDroxRunSettingsService } from '../../common/droxRunSettingsService.js';
import { parseLlmProvider, readLlmProvider, resolveLlmCatalogConnection } from '../../common/droxLlmCatalog.js';
import { mergeLlmHttpHeaders } from '../../common/droxLlmHeaders.js';
import { callDroxProseLlm } from '../../common/droxInlineChat.js';
import { focusDroxSdtcmMap, IDroxSdtcmFocus } from '../../common/sdtcm/droxSdtcmDiff.js';
import {
	droxSdtcmQuoteMatches,
	emptyDroxSdtcmBaseline,
	emptyDroxSdtcmMap,
	IDroxSdtcmBaseline,
	DroxSdtcmForm,
	DroxSdtcmKind,
	IDroxSdtcmMap,
} from '../../common/sdtcm/droxSdtcmMap.js';
import {
	acceptDroxSdtcmFile,
	acceptDroxSdtcmLinks,
	buildDroxSdtcmLinkTurn,
	buildDroxSdtcmTurn,
	completeDroxSdtcmLinks,
	droxSdtcmLinkFiles,
	DROX_SDTCM_SYSTEM_PROMPT,
	readDroxSdtcmFileDraft,
	readDroxSdtcmLinkDraft,
	readDroxSdtcmRead,
} from '../../common/sdtcm/droxSdtcmRole.js';
import {
	acceptDroxSdtcmData,
	acceptDroxSdtcmTrace,
	buildDroxSdtcmDataTurn,
	buildDroxSdtcmTraceTurn,
	readDroxSdtcmDataDraft,
	readDroxSdtcmTraceDraft,
} from '../../common/sdtcm/data/droxSdtcmData.js';
import { listDroxSdtcmSources, readDroxSdtcmStore, readDroxSdtcmText, writeDroxSdtcmStore } from './droxSdtcmFiles.js';
import { clampDroxSdtcmAttraction, DroxSdtcmPlacementMode } from '../../common/sdtcm/placement/droxSdtcmPlacement.js';

export const IDroxSdtcmService = createDecorator<IDroxSdtcmService>('droxSdtcmService');

export interface IDroxSdtcmExchange {
	readonly role: 'engine' | 'agent';
	readonly text: string;
}

export interface IDroxSdtcmSnapshot {
	readonly phase: 'idle' | 'running' | 'stopped' | 'error';
	readonly mode: 'build' | 'align' | 'none';
	readonly message: string;
	readonly step: number;
	readonly maxSteps: number;
	readonly journal: readonly string[];
	readonly exchanges: readonly IDroxSdtcmExchange[];
	readonly map: IDroxSdtcmMap;
	readonly files: readonly string[];
}

export interface IDroxSdtcmAlignResult {
	readonly busy: boolean;
	readonly stopped: boolean;
	readonly changed: boolean;
	readonly message: string;
	readonly brickCount: number;
}

export interface IDroxSdtcmDisplay {
	readonly kinds: ReadonlySet<DroxSdtcmKind>;
	readonly forms: ReadonlySet<DroxSdtcmForm>;
	readonly links: boolean;
	readonly placement: DroxSdtcmPlacementMode;
	readonly attraction: number;
	readonly focus: readonly string[];
}

export interface IDroxSdtcmService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<IDroxSdtcmSnapshot>;
	readonly onDidChangeDisplay: Event<IDroxSdtcmDisplay>;
	getSnapshot(): IDroxSdtcmSnapshot;
	getDisplay(): IDroxSdtcmDisplay;
	setDisplay(display: IDroxSdtcmDisplay): void;
	open(workspace: URI): Promise<void>;
	stop(): void;
	resume(): Promise<void>;
	align(workspace: URI, note?: string): Promise<IDroxSdtcmAlignResult>;
}

export class DroxSdtcmService extends Disposable implements IDroxSdtcmService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<IDroxSdtcmSnapshot>());
	readonly onDidChange = this._onDidChange.event;
	private readonly _onDidChangeDisplay = this._register(new Emitter<IDroxSdtcmDisplay>());
	readonly onDidChangeDisplay = this._onDidChangeDisplay.event;
	private _display: IDroxSdtcmDisplay = {
		kinds: new Set<DroxSdtcmKind>(['type', 'operation', 'value', 'source']),
		forms: new Set<DroxSdtcmForm>(['declare', 'apply']),
		links: true,
		placement: 'free',
		attraction: 0.5,
		focus: [],
	};

	private _workspace: URI | undefined;
	private _loadedKey: string | undefined;
	private _map: IDroxSdtcmMap = emptyDroxSdtcmMap();
	private _baseline: IDroxSdtcmBaseline = emptyDroxSdtcmBaseline();
	private _phase: IDroxSdtcmSnapshot['phase'] = 'idle';
	private _mode: IDroxSdtcmSnapshot['mode'] = 'none';
	private _message = 'Open the tab to load the map.';
	private _step = 0;
	private _maxSteps = 0;
	private _journal: string[] = [];
	private _exchanges: IDroxSdtcmExchange[] = [];
	private _files: string[] = [];
	private _seq = 0;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IDroxEngineService private readonly engineService: IDroxEngineService,
		@IDroxRunSettingsService private readonly runSettingsService: IDroxRunSettingsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	getDisplay(): IDroxSdtcmDisplay {
		return this._display;
	}

	setDisplay(display: IDroxSdtcmDisplay): void {
		this._display = {
			kinds: new Set(display.kinds),
			forms: new Set(display.forms),
			links: display.links,
			placement: display.placement,
			attraction: clampDroxSdtcmAttraction(display.attraction),
			focus: [...new Set(display.focus)],
		};
		this._onDidChangeDisplay.fire(this._display);
	}

	getSnapshot(): IDroxSdtcmSnapshot {
		return {
			phase: this._phase,
			mode: this._mode,
			message: this._message,
			step: this._step,
			maxSteps: this._maxSteps,
			journal: this._journal,
			exchanges: this._exchanges,
			map: this._map,
			files: this._files,
		};
	}

	async open(workspace: URI): Promise<void> {
		const key = workspace.toString();
		if (this._loadedKey === key) {
			this._emit();
			return;
		}
		await this._load(workspace);
		if (this._map.bricks.length === 0 && this._phase !== 'running') {
			void this._run('build');
		}
	}

	stop(): void {
		if (this._phase !== 'running') {
			return;
		}
		this._seq++;
		this._phase = 'stopped';
		this._note('Role stopped. The map already written is kept.');
	}

	async resume(): Promise<void> {
		if (!this._workspace) {
			return;
		}
		await this._run('build');
	}

	async align(workspace: URI, note?: string): Promise<IDroxSdtcmAlignResult> {
		if (this._phase === 'running') {
			return { busy: true, stopped: false, changed: false, message: 'The SDTCM role is already running.', brickCount: this._map.bricks.length };
		}
		await this._load(workspace);
		return this._run('align', note);
	}

	private async _load(workspace: URI): Promise<void> {
		this._workspace = workspace;
		this._loadedKey = workspace.toString();
		const stored = await readDroxSdtcmStore(this.fileService, workspace);
		this._map = stored.map;
		this._baseline = stored.baseline;
		this._files = await listDroxSdtcmSources(this.fileService, workspace);
		if (this._phase !== 'running') {
			this._phase = 'idle';
			this._message = this._map.bricks.length ? 'Map loaded.' : 'No map yet. The role will write it.';
		}
		this._emit();
	}

	private async _run(mode: 'build' | 'align', note?: string): Promise<IDroxSdtcmAlignResult> {
		const workspace = this._workspace;
		if (!workspace) {
			return { busy: false, stopped: false, changed: false, message: 'No folder is open.', brickCount: 0 };
		}
		if (this._phase === 'running') {
			return { busy: true, stopped: false, changed: false, message: 'The SDTCM role is already running.', brickCount: this._map.bricks.length };
		}
		const token = ++this._seq;
		this._phase = 'running';
		this._mode = mode;
		this._step = 0;
		this._journal = [];
		this._exchanges = [];
		this._map = { ...this._map, data: [] };
		this._note(mode === 'align' ? 'Realigning the map.' : 'The role is writing the map.');
		try {
			const sources = await listDroxSdtcmSources(this.fileService, workspace);
			this._files = sources;
			const focus = mode === 'align' ? await this._focus(workspace) : [];
			const queue = mode === 'align' ? focus.map(item => item.path) : sources;
			this._maxSteps = queue.length;
			this._note(mode === 'align'
				? `${queue.length} file(s) to realign. One turn per file.`
				: `${sources.length} source file(s) kept. One turn per file.`);
			if (!queue.length) {
				this._finish(token, 'idle', mode === 'align' ? 'No gap with the map.' : 'No file in the tree.');
				return { busy: false, stopped: false, changed: false, message: this._message, brickCount: this._map.bricks.length };
			}
			this._say('engine', DROX_SDTCM_SYSTEM_PROMPT);
			const cache = new Map<string, string>();
			let changed = false;
			let refused = false;
			for (let index = 0; index < queue.length; index++) {
				if (token !== this._seq) {
					return this._stoppedResult();
				}
				const path = queue[index];
				const text = await this._text(workspace, path, cache);
				if (text === undefined) {
					this._step = index + 1;
					this._note(`Turn ${this._step}/${queue.length} — ${path} is unreadable.`);
					continue;
				}
				let hint = '';
				let accepted = false;
				let jsonFails = 0;
				const reads = new Map<string, string>();
				for (let call = 0; call < 14 && !accepted && jsonFails < 3; call++) {
					if (token !== this._seq) {
						return this._stoppedResult();
					}
					this._step = index + 1;
					const user = buildDroxSdtcmTurn({
						mode,
						path,
						files: sources,
						text,
						reads: [...reads].map(([readPath, readText]) => ({ path: readPath, text: readText })),
						focus,
						note,
						hint,
					});
					this._note(`Turn ${this._step}/${queue.length} — ${path}`);
					this._say('engine', user);
					const raw = await this._ask(workspace, user);
					if (token !== this._seq) {
						return this._stoppedResult();
					}
					this._say('agent', raw);
					const tool = readDroxSdtcmRead(raw);
					if (tool) {
						hint = await this._takeRead(workspace, tool, sources, reads, cache);
						if (hint) {
							this._note(hint);
						}
						continue;
					}
					const draft = readDroxSdtcmFileDraft(raw, path);
					if (!draft.ok) {
						jsonFails++;
						hint = draft.errors.join('\n');
						this._note(hint);
						continue;
					}
					const reviewed = acceptDroxSdtcmFile(this._map, path, draft.items, text, new Set(sources));
					if (!reviewed.ok) {
						jsonFails++;
						hint = reviewed.errors.join('\n');
						this._note(hint);
						continue;
					}
					this._map = reviewed.map;
					this._adoptBaseline(cache, [path]);
					await writeDroxSdtcmStore(this.fileService, workspace, this._map, this._baseline);
					changed = true;
					accepted = true;
					this._note(`map.json written — ${this._map.bricks.length} brick(s).`);
				}
				if (!accepted) {
					refused = true;
					this._note(`${path} refused.`);
				}
			}
			if (token !== this._seq) {
				return this._stoppedResult();
			}
			if (this._map.bricks.some(brick => brick.files.length > 0)) {
				this._maxSteps = queue.length + 1;
				const linked = await this._linkPass(workspace, token, sources, cache);
				if (linked === 'stopped') {
					return this._stoppedResult();
				}
				if (linked === 'refused') {
					refused = true;
				} else {
					changed = true;
				}
			}
			if (token !== this._seq) {
				return this._stoppedResult();
			}
			const dataFiles = [...new Set(this._map.bricks.map(brick => brick.file))].sort();
			if (dataFiles.length) {
				const recorded = await this._dataPass(workspace, token, dataFiles, sources, cache);
				if (recorded === 'stopped') {
					return this._stoppedResult();
				}
				if (recorded === 'refused') {
					refused = true;
				} else if (recorded === 'written') {
					changed = true;
				}
			}
			const traceFiles = [...new Set(this._map.data.map(item => item.file))].sort();
			if (traceFiles.length) {
				const traced = await this._tracePass(workspace, token, traceFiles, sources, cache);
				if (traced === 'stopped') {
					return this._stoppedResult();
				}
				if (traced === 'refused') {
					refused = true;
				} else if (traced === 'written') {
					changed = true;
				}
			}
			this._finish(token, 'idle', refused ? 'The last map was refused.' : 'Map is up to date.');
			return { busy: false, stopped: false, changed, message: this._message, brickCount: this._map.bricks.length };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.warn(`[sdtcm] ${message}`);
			this._finish(token, 'error', message);
			return { busy: false, stopped: false, changed: false, message, brickCount: this._map.bricks.length };
		}
	}

	private async _takeRead(
		workspace: URI,
		tool: { readonly ok: true; readonly path: string } | { readonly ok: false; readonly error: string },
		sources: readonly string[],
		reads: Map<string, string>,
		cache: Map<string, string>,
	): Promise<string> {
		if (!tool.ok) {
			return tool.error;
		}
		if (!sources.includes(tool.path)) {
			return `${tool.path} is not in the file tree.`;
		}
		if (reads.has(tool.path)) {
			return `READ ${tool.path} is already in the message. Return the JSON.`;
		}
		if (reads.size >= 8) {
			return 'Stop reading. Return the JSON.';
		}
		const body = await this._text(workspace, tool.path, cache);
		if (body === undefined) {
			return `${tool.path} is unreadable.`;
		}
		reads.set(tool.path, body);
		return '';
	}

	private async _linkPass(
		workspace: URI,
		token: number,
		sources: readonly string[],
		cache: Map<string, string>,
	): Promise<'linked' | 'refused' | 'stopped'> {
		const files = droxSdtcmLinkFiles(this._map);
		if (!files.length) {
			return 'refused';
		}
		let refused = false;
		for (let index = 0; index < files.length; index++) {
			if (token !== this._seq) {
				return 'stopped';
			}
			const path = files[index];
			this._step = index + 1;
			this._maxSteps = files.length;
			let hint = '';
			let jsonFails = 0;
			let accepted = false;
			const reads = new Map<string, string>();
			for (let call = 0; call < 14 && !accepted && jsonFails < 3; call++) {
				if (token !== this._seq) {
					return 'stopped';
				}
				const user = buildDroxSdtcmLinkTurn({
					map: this._map,
					file: path,
					reads: [...reads].map(([readPath, readText]) => ({ path: readPath, text: readText })),
					hint,
				});
				this._note(`Brick links — ${this._step}/${this._maxSteps}`);
				this._say('engine', user);
				const raw = await this._ask(workspace, user);
				if (token !== this._seq) {
					return 'stopped';
				}
				this._say('agent', raw);
				const tool = readDroxSdtcmRead(raw);
				if (tool) {
					hint = await this._takeRead(workspace, tool, sources, reads, cache);
					if (hint) {
						this._note(hint);
					}
					continue;
				}
				const draft = readDroxSdtcmLinkDraft(raw);
				if (!draft.ok) {
					jsonFails++;
					hint = draft.errors.join('\n');
					this._note(hint);
					continue;
				}
				const reviewed = acceptDroxSdtcmLinks(this._map, draft.links, path);
				if (!reviewed.ok && reviewed.errors.some(error => !error.includes('still has no brick link'))) {
					jsonFails++;
					hint = reviewed.errors.join('\n');
					this._note(hint);
					continue;
				}
				this._map = completeDroxSdtcmLinks(reviewed.map, path);
				accepted = true;
			}
			if (!accepted) {
				this._map = completeDroxSdtcmLinks(this._map, path);
				refused = true;
			}
			await writeDroxSdtcmStore(this.fileService, workspace, this._map, this._baseline);
			this._note(accepted ? 'Brick links written.' : `${path} links completed.`);
		}
		return refused ? 'refused' : 'linked';
	}

	private async _dataPass(
		workspace: URI,
		token: number,
		files: readonly string[],
		sources: readonly string[],
		cache: Map<string, string>,
	): Promise<'written' | 'refused' | 'empty' | 'stopped'> {
		let wrote = false;
		let refused = false;
		for (let index = 0; index < files.length; index++) {
			if (token !== this._seq) {
				return 'stopped';
			}
			const path = files[index];
			const text = await this._text(workspace, path, cache);
			this._step = index + 1;
			this._maxSteps = files.length;
			if (text === undefined) {
				refused = true;
				this._note(`Data — ${this._step}/${files.length}`);
				this._note(`${path} data refused.`);
				continue;
			}
			let hint = '';
			let accepted = false;
			let jsonFails = 0;
			const reads = new Map<string, string>();
			for (let call = 0; call < 14 && !accepted && jsonFails < 3; call++) {
				if (token !== this._seq) {
					return 'stopped';
				}
				const user = buildDroxSdtcmDataTurn({
					path,
					text,
					map: this._map,
					reads: [...reads].map(([readPath, readText]) => ({ path: readPath, text: readText })),
					hint,
				});
				this._note(`Data — ${this._step}/${files.length}`);
				this._say('engine', user);
				const raw = await this._ask(workspace, user);
				if (token !== this._seq) {
					return 'stopped';
				}
				this._say('agent', raw);
				const tool = readDroxSdtcmRead(raw);
				if (tool) {
					hint = await this._takeRead(workspace, tool, sources, reads, cache);
					if (hint) {
						this._note(hint);
					}
					continue;
				}
				const draft = readDroxSdtcmDataDraft(raw);
				if (!draft.ok) {
					jsonFails++;
					hint = draft.errors.join('\n');
					this._note(hint);
					continue;
				}
				const reviewed = acceptDroxSdtcmData(this._map, path, draft.data, text);
				if (!reviewed.ok) {
					jsonFails++;
					hint = reviewed.errors.join('\n');
					this._note(hint);
					continue;
				}
				this._map = reviewed.map;
				await writeDroxSdtcmStore(this.fileService, workspace, this._map, this._baseline);
				accepted = true;
				wrote = true;
				this._note('Data written.');
			}
			if (!accepted) {
				refused = true;
				this._note(`${path} data refused.`);
			}
		}
		if (refused) {
			return 'refused';
		}
		return wrote ? 'written' : 'empty';
	}

	private async _tracePass(
		workspace: URI,
		token: number,
		files: readonly string[],
		sources: readonly string[],
		cache: Map<string, string>,
	): Promise<'written' | 'refused' | 'empty' | 'stopped'> {
		let wrote = false;
		let refused = false;
		for (let index = 0; index < files.length; index++) {
			if (token !== this._seq) {
				return 'stopped';
			}
			const path = files[index];
			this._step = index + 1;
			this._maxSteps = files.length;
			let hint = '';
			let accepted = false;
			let jsonFails = 0;
			const reads = new Map<string, string>();
			for (let call = 0; call < 14 && !accepted && jsonFails < 3; call++) {
				if (token !== this._seq) {
					return 'stopped';
				}
				const user = buildDroxSdtcmTraceTurn({
					path,
					map: this._map,
					reads: [...reads].map(([readPath, readText]) => ({ path: readPath, text: readText })),
					hint,
				});
				this._note(`Trace — ${this._step}/${files.length}`);
				this._say('engine', user);
				const raw = await this._ask(workspace, user);
				if (token !== this._seq) {
					return 'stopped';
				}
				this._say('agent', raw);
				const tool = readDroxSdtcmRead(raw);
				if (tool) {
					hint = await this._takeRead(workspace, tool, sources, reads, cache);
					if (hint) {
						this._note(hint);
					}
					continue;
				}
				const draft = readDroxSdtcmTraceDraft(raw);
				if (!draft.ok) {
					jsonFails++;
					hint = draft.errors.join('\n');
					this._note(hint);
					continue;
				}
				const texts = new Map<string, string>();
				const needed = new Set<string>([path]);
				for (const step of draft.steps) {
					const file = this._map.bricks.find(brick => brick.id === step.brick)?.file;
					if (file) {
						needed.add(file);
					}
				}
				for (const file of needed) {
					const body = await this._text(workspace, file, cache);
					if (body !== undefined) {
						texts.set(file, body);
					}
				}
				const reviewed = acceptDroxSdtcmTrace(this._map, path, draft.steps, texts);
				if (!reviewed.ok) {
					jsonFails++;
					hint = reviewed.errors.join('\n');
					this._note(hint);
					continue;
				}
				this._map = reviewed.map;
				await writeDroxSdtcmStore(this.fileService, workspace, this._map, this._baseline);
				accepted = true;
				wrote = true;
				this._note('Trace written.');
			}
			if (!accepted) {
				refused = true;
				this._note('Trace refused.');
			}
		}
		if (refused) {
			return 'refused';
		}
		return wrote ? 'written' : 'empty';
	}

	private async _focus(workspace: URI): Promise<IDroxSdtcmFocus[]> {
		const cited = new Set<string>();
		if (this._map.entry) {
			cited.add(this._map.entry.file);
		}
		for (const brick of this._map.bricks) {
			cited.add(brick.file);
		}
		const current: Record<string, string | undefined> = {};
		const baseline = { ...this._baseline.files };
		const compared: Record<string, string> = { ...baseline };
		let adopted = false;
		for (const path of cited) {
			const text = await readDroxSdtcmText(this.fileService, workspace, path);
			current[path] = text;
			if (Object.hasOwn(baseline, path) || text === undefined) {
				continue;
			}
			if (this._quotesHold(path, text)) {
				baseline[path] = text;
				compared[path] = text;
				adopted = true;
			} else {
				compared[path] = '';
			}
		}
		if (adopted) {
			this._baseline = { version: 1, files: baseline };
			await writeDroxSdtcmStore(this.fileService, workspace, this._map, this._baseline);
		}
		return focusDroxSdtcmMap(this._map, compared, current);
	}

	private _quotesHold(path: string, text: string): boolean {
		if (this._map.entry && this._map.entry.file === path && !droxSdtcmQuoteMatches(text, this._map.entry.line, this._map.entry.quote)) {
			return false;
		}
		return this._map.bricks.every(brick => brick.file !== path || droxSdtcmQuoteMatches(text, brick.line, brick.quote));
	}

	private async _text(workspace: URI, path: string, cache: Map<string, string>): Promise<string | undefined> {
		const cached = cache.get(path);
		if (cached !== undefined) {
			return cached;
		}
		const text = await readDroxSdtcmText(this.fileService, workspace, path);
		if (text === undefined || text.length > 200_000) {
			return undefined;
		}
		cache.set(path, text);
		return text;
	}

	private _adoptBaseline(cache: ReadonlyMap<string, string>, also: readonly string[] = []): void {
		const files = { ...this._baseline.files };
		const touched = new Set<string>(also);
		if (this._map.entry) {
			touched.add(this._map.entry.file);
		}
		for (const brick of this._map.bricks) {
			touched.add(brick.file);
		}
		for (const path of touched) {
			const text = cache.get(path);
			if (text !== undefined) {
				files[path] = text;
			}
		}
		this._baseline = { version: 1, files };
	}

	private async _ask(workspace: URI, user: string): Promise<string> {
		await this.engineService.initialize();
		const conn = await resolveLlmCatalogConnection(this.configurationService, this.fileService, workspace);
		const llm = this.runSettingsService.getLlmSettings(workspace);
		const model = llm.model?.trim() ?? '';
		if (!model || !conn.server.trim()) {
			throw new Error('No conversation model is configured.');
		}
		const provider = parseLlmProvider(conn.provider) || readLlmProvider(this.configurationService, workspace);
		const headers = mergeLlmHttpHeaders(conn.apiKey, conn.headers, { provider, server: conn.server });
		const text = await callDroxProseLlm({
			provider,
			server: conn.server,
			model,
			headers,
			disableThinking: true,
			fetchHttp: (url, hdrs, options) => this.engineService.fetchHttp(url, hdrs, options),
		}, DROX_SDTCM_SYSTEM_PROMPT, user, 180_000);
		if (!text.trim()) {
			throw new Error('The model returned nothing.');
		}
		return text;
	}

	private _finish(token: number, phase: 'idle' | 'error', message: string): void {
		if (token !== this._seq) {
			return;
		}
		this._phase = phase;
		this._mode = 'none';
		this._step = 0;
		this._note(message);
	}

	private _stoppedResult(): IDroxSdtcmAlignResult {
		return { busy: false, stopped: true, changed: false, message: this._message, brickCount: this._map.bricks.length };
	}

	private _note(line: string): void {
		this._message = line;
		this._journal = [...this._journal, line].slice(-14);
		this._emit();
	}

	private _say(role: IDroxSdtcmExchange['role'], text: string): void {
		this._exchanges = [...this._exchanges, { role, text }];
		this._emit();
	}

	private _emit(): void {
		this._onDidChange.fire(this.getSnapshot());
	}
}

registerSingleton(IDroxSdtcmService, DroxSdtcmService, InstantiationType.Delayed);
