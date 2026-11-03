/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
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
import { DROX_SDTCM_PROBE_PHASES, DroxSdtcmProbePhase, expandDroxSdtcmPhases, seedDroxSdtcmProbe, summarizeDroxSdtcmConsistency } from '../../common/sdtcm/droxSdtcmConsistency.js';
import { defaultDroxSdtcmDisplay, IDroxSdtcmSavedDisplay, savedDroxSdtcmDisplay } from '../../common/sdtcm/droxSdtcmDisplay.js';
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
	droxSdtcmFilesToLink,
	acceptDroxSdtcmFolderTags,
	acceptDroxSdtcmTags,
	buildDroxSdtcmFolderTagTurn,
	buildDroxSdtcmTagTurn,
	IDroxSdtcmTag,
	IDroxSdtcmTagMarkDraft,
	readDroxSdtcmFileDraft,
	readDroxSdtcmLinkDraft,
	readDroxSdtcmRead,
	readDroxSdtcmTagDraft,
} from '../../common/sdtcm/droxSdtcmRole.js';
import { droxSdtcmSystemPrompt } from '../../common/sdtcm/droxSdtcmPrompt.js';
import {
	acceptDroxSdtcmData,
	acceptDroxSdtcmTrace,
	buildDroxSdtcmDataTurn,
	buildDroxSdtcmTraceTurn,
	readDroxSdtcmDataDraft,
	readDroxSdtcmTraceDraft,
} from '../../common/sdtcm/data/droxSdtcmData.js';
import { listDroxSdtcmSources, readDroxSdtcmDisplay, readDroxSdtcmStore, readDroxSdtcmTags, readDroxSdtcmText, writeDroxSdtcmDisplay, writeDroxSdtcmStore, writeDroxSdtcmTags } from './droxSdtcmFiles.js';

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
	/** Percentage of a consistency run, empty outside that run. */
	readonly progress: string;
	readonly journal: readonly string[];
	readonly exchanges: readonly IDroxSdtcmExchange[];
	readonly map: IDroxSdtcmMap;
	readonly files: readonly string[];
	readonly tags: readonly IDroxSdtcmTag[];
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
	/** When set, folders can be dragged. Otherwise they stay where they are. */
	readonly move: boolean;
	readonly focus: readonly string[];
	/** Tag names kept on the schema. An untagged brick stays visible. */
	readonly visibleTags: ReadonlySet<string>;
}

export interface IDroxSdtcmService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<IDroxSdtcmSnapshot>;
	readonly onDidChangeDisplay: Event<IDroxSdtcmDisplay>;
	getSnapshot(): IDroxSdtcmSnapshot;
	getDisplay(): IDroxSdtcmDisplay;
	setDisplay(display: IDroxSdtcmDisplay): void;
	setTags(tags: readonly IDroxSdtcmTag[]): void;
	open(workspace: URI): Promise<void>;
	stop(): void;
	getPhasePick(): readonly DroxSdtcmProbePhase[];
	setPhasePick(phases: readonly DroxSdtcmProbePhase[]): void;
	resume(): Promise<void>;
	align(workspace: URI, note?: string): Promise<IDroxSdtcmAlignResult>;
	probe(phases: readonly DroxSdtcmProbePhase[], turns: number): Promise<string>;
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
		move: true,
		focus: [],
		visibleTags: new Set<string>(),
	};
	private _tags: IDroxSdtcmTag[] = [];

	private _workspace: URI | undefined;
	private _loadedKey: string | undefined;
	private _phasePick: DroxSdtcmProbePhase[] = [...DROX_SDTCM_PROBE_PHASES];
	private _map: IDroxSdtcmMap = emptyDroxSdtcmMap();
	private _baseline: IDroxSdtcmBaseline = emptyDroxSdtcmBaseline();
	private _phase: IDroxSdtcmSnapshot['phase'] = 'idle';
	private _mode: IDroxSdtcmSnapshot['mode'] = 'none';
	private _message = 'Open the tab to load the map.';
	private _step = 0;
	private _maxSteps = 0;
	private _progress = '';
	private _probePlan: { turn: number; turns: number; phases: readonly DroxSdtcmProbePhase[] } | undefined;
	private _journal: string[] = [];
	private _exchanges: IDroxSdtcmExchange[] = [];
	private _files: string[] = [];
	private _seq = 0;
	/** While set, a consistency run must not replace the map the user is looking at. */
	private _holdStore = false;

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
			move: display.move,
			focus: [...new Set(display.focus)],
			visibleTags: new Set(display.visibleTags),
		};
		this._onDidChangeDisplay.fire(this._display);
		void this._writeDisplay();
	}

	getSnapshot(): IDroxSdtcmSnapshot {
		return {
			phase: this._phase,
			mode: this._mode,
			message: this._message,
			step: this._step,
			maxSteps: this._maxSteps,
			progress: this._progress,
			journal: this._journal,
			exchanges: this._exchanges,
			map: this._map,
			files: this._files,
			tags: this._tags,
		};
	}

	setTags(tags: readonly IDroxSdtcmTag[]): void {
		const next = tags.map(tag => ({ name: tag.name, description: tag.description, color: tag.color, scope: tag.scope }));
		const names = new Set(next.map(tag => tag.name));
		const visible = new Set([...this._display.visibleTags].filter(name => names.has(name)));
		for (const tag of next) {
			if (!this._tags.some(current => current.name === tag.name)) {
				visible.add(tag.name);
			}
		}
		this._tags = next;
		this._map = {
			...this._map,
			bricks: this._map.bricks.map(brick => ({ ...brick, tags: (brick.tags ?? []).filter(mark => names.has(mark.name)) })),
			data: this._map.data.map(item => ({ ...item, tags: (item.tags ?? []).filter(mark => names.has(mark.name)) })),
			placed: (this._map.placed ?? []).filter(mark => names.has(mark.name)),
		};
		this._display = { ...this._display, visibleTags: visible };
		this._onDidChangeDisplay.fire(this._display);
		void this._writeDisplay();
		void this._writeTags();
		void this._persist();
		this._emit();
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

	getPhasePick(): readonly DroxSdtcmProbePhase[] {
		return this._phasePick;
	}

	setPhasePick(phases: readonly DroxSdtcmProbePhase[]): void {
		const chosen = new Set(phases);
		this._phasePick = DROX_SDTCM_PROBE_PHASES.filter(phase => chosen.has(phase));
	}

	async resume(): Promise<void> {
		if (!this._workspace || this._phase === 'running') {
			return;
		}
		const selected = expandDroxSdtcmPhases(this._phasePick);
		if (!selected.length) {
			this._note('Select at least one phase.');
			return;
		}
		this._map = seedDroxSdtcmProbe(this._map, new Set(selected));
		if (selected.includes('build')) {
			this._baseline = emptyDroxSdtcmBaseline();
		}
		await this._run('build', undefined, selected);
	}

	async align(workspace: URI, note?: string): Promise<IDroxSdtcmAlignResult> {
		if (this._phase === 'running') {
			return { busy: true, stopped: false, changed: false, message: 'The SDTCM role is already running.', brickCount: this._map.bricks.length };
		}
		await this._load(workspace);
		return this._run('align', note);
	}

	/** Runs the chosen phases several times and writes each map beside the live one. The live map is restored. */
	async probe(phases: readonly DroxSdtcmProbePhase[], turns: number): Promise<string> {
		const workspace = this._workspace;
		if (!workspace) {
			return 'No folder is open.';
		}
		if (this._phase === 'running') {
			return 'The SDTCM role is already running.';
		}
		const selected = phases.filter(phase => phase === 'build' || phase === 'data' || phase === 'trace' || phase === 'link' || phase === 'tag');
		if (!selected.length) {
			return 'Select at least one phase.';
		}
		const count = Math.min(20, Math.max(1, Math.floor(turns)));
		const savedMap = cloneDroxSdtcmMap(this._map);
		const savedBaseline = cloneDroxSdtcmBaseline(this._baseline);
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const dir = URI.joinPath(workspace, '.drox', 'sdtcm', 'consistency', stamp);
		const maps: IDroxSdtcmMap[] = [];
		this._holdStore = true;
		this._probePlan = { turn: 1, turns: count, phases: selected };
		try {
			await this.fileService.createFolder(dir);
			for (let turn = 1; turn <= count; turn++) {
				this._probePlan = { turn, turns: count, phases: selected };
				this._map = seedDroxSdtcmProbe(savedMap, new Set(selected));
				this._baseline = selected.includes('build') ? emptyDroxSdtcmBaseline() : cloneDroxSdtcmBaseline(savedBaseline);
				const result = await this._run('build', undefined, selected);
				if (result.busy) {
					break;
				}
				maps.push(cloneDroxSdtcmMap(this._map));
				const name = `turn-${String(turn).padStart(2, '0')}.json`;
				await this.fileService.writeFile(URI.joinPath(dir, name), VSBuffer.fromString(`${JSON.stringify(maps[maps.length - 1], null, 2)}\n`));
				this._note(`Consistency ${turn}/${count} saved.`);
				if (result.stopped) {
					break;
				}
			}
			if (!maps.length) {
				return 'Consistency stopped before a turn was saved.';
			}
			const summary = summarizeDroxSdtcmConsistency(maps, selected);
			await this.fileService.writeFile(URI.joinPath(dir, 'summary.md'), VSBuffer.fromString(summary));
			const where = `.drox/sdtcm/consistency/${stamp}`;
			this._note(`Consistency written in ${where}.`);
			return where;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logService.warn(`[sdtcm] ${message}`);
			this._note(message);
			return message;
		} finally {
			this._holdStore = false;
			this._probePlan = undefined;
			this._progress = '';
			this._map = savedMap;
			this._baseline = savedBaseline;
			if (this._phase !== 'error') {
				this._phase = 'idle';
				this._mode = 'none';
			}
			this._emit();
		}
	}

	private async _load(workspace: URI): Promise<void> {
		this._workspace = workspace;
		this._loadedKey = workspace.toString();
		const stored = await readDroxSdtcmStore(this.fileService, workspace);
		this._map = stored.map;
		this._baseline = stored.baseline;
		this._tags = await readDroxSdtcmTags(this.fileService, workspace);
		const saved = await readDroxSdtcmDisplay(this.fileService, workspace);
		const names = this._tags.map(tag => tag.name);
		const display = saved ? savedDroxSdtcmDisplay(saved, names) : defaultDroxSdtcmDisplay(names);
		this._display = {
			kinds: new Set(display.kinds),
			forms: new Set(display.forms),
			links: display.links,
			move: display.move,
			focus: [...display.focus],
			visibleTags: new Set(display.visibleTags ?? names),
		};
		this._onDidChangeDisplay.fire(this._display);
		this._files = await listDroxSdtcmSources(this.fileService, workspace);
		if (this._phase !== 'running') {
			this._phase = 'idle';
			this._message = this._map.bricks.length ? 'Map loaded.' : 'No map yet. The role will write it.';
		}
		this._emit();
	}

	private async _run(mode: 'build' | 'align', note?: string, only?: readonly DroxSdtcmProbePhase[]): Promise<IDroxSdtcmAlignResult> {
		const workspace = this._workspace;
		if (!workspace) {
			return { busy: false, stopped: false, changed: false, message: 'No folder is open.', brickCount: 0 };
		}
		if (this._phase === 'running') {
			return { busy: true, stopped: false, changed: false, message: 'The SDTCM role is already running.', brickCount: this._map.bricks.length };
		}
		const phases = new Set<DroxSdtcmProbePhase>(only ?? ['build', 'data', 'trace', 'link', 'tag']);
		const runBuild = mode === 'align' || !only || phases.has('build');
		const token = ++this._seq;
		this._phase = 'running';
		this._mode = mode;
		this._step = 0;
		this._journal = [];
		this._exchanges = [];
		if (!only || phases.has('build') || phases.has('data')) {
			this._map = { ...this._map, data: [] };
		}
		this._note(mode === 'align' ? 'Realigning the map.' : only ? `Phases: ${only.join(', ')}.` : 'The role is writing the map.');
		try {
			const sources = await listDroxSdtcmSources(this.fileService, workspace);
			this._files = sources;
			const cache = new Map<string, string>();
			let changed = false;
			let refused = false;
			if (runBuild) {
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
				this._say('engine', droxSdtcmSystemPrompt(mode === 'align' ? 'align' : 'build'));
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
						this._probeAt('build', index, queue.length, path);
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
						const raw = await this._ask(workspace, user, mode === 'align' ? 'align' : 'build');
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
						await this._persist();
						changed = true;
						accepted = true;
						this._note(`map.json written — ${this._map.bricks.length} brick(s).`);
					}
					if (!accepted) {
						refused = true;
						this._note(`${path} refused.`);
					}
				}
			}
			if (token !== this._seq) {
				return this._stoppedResult();
			}
			const dataFiles = [...new Set(this._map.bricks.map(brick => brick.file))].sort();
			if ((!only || phases.has('data')) && dataFiles.length) {
				this._say('engine', droxSdtcmSystemPrompt('data'));
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
			if ((!only || phases.has('trace')) && traceFiles.length) {
				this._say('engine', droxSdtcmSystemPrompt('trace'));
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
			const linkFiles = droxSdtcmFilesToLink(this._map);
			if ((!only || phases.has('link')) && linkFiles.length) {
				this._say('engine', droxSdtcmSystemPrompt('link'));
				const linked = await this._linkPass(workspace, token, linkFiles, sources, cache);
				if (linked === 'stopped') {
					return this._stoppedResult();
				}
				if (linked === 'refused') {
					refused = true;
				} else if (linked === 'written') {
					changed = true;
				}
			}
			const fileScoped = this._tags.some(tag => tag.scope === 'file');
			const tagFiles = this._tags.some(tag => tag.scope !== 'folder')
				? (fileScoped ? [...sources].sort() : [...new Set([...this._map.bricks.map(brick => brick.file), ...this._map.data.map(item => item.file)])].sort())
				: [];
			if ((!only || phases.has('tag')) && this._tags.length) {
				this._say('engine', droxSdtcmSystemPrompt('tag'));
				const tagged = await this._tagPass(workspace, token, tagFiles, sources, cache);
				if (tagged === 'stopped') {
					return this._stoppedResult();
				}
				if (tagged === 'refused') {
					refused = true;
				} else if (tagged === 'written') {
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
			this._probeAt('data', index, files.length, path);
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
				this._note(this._probePlan ? `${path}` : `Data — ${this._step}/${files.length}`);
				this._say('engine', user);
				const raw = await this._ask(workspace, user, 'data');
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
				await this._persist();
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
			this._probeAt('trace', index, files.length, path);
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
				this._note(this._probePlan ? `${path}` : `Trace — ${this._step}/${files.length}`);
				this._say('engine', user);
				const raw = await this._ask(workspace, user, 'trace');
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
				await this._persist();
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
			await this._persist();
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

	private async _linkPass(
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
			this._probeAt('link', index, files.length, path);
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
					files: sources,
					reads: [...reads].map(([readPath, readText]) => ({ path: readPath, text: readText })),
					hint,
				});
				this._note(this._probePlan ? `${path}` : `Links — ${this._step}/${files.length}`);
				this._say('engine', user);
				const raw = await this._ask(workspace, user, 'link');
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
				const coverageOnly = !reviewed.ok && reviewed.errors.every(error => error.includes('still has no brick link'));
				if (!reviewed.ok && !coverageOnly) {
					jsonFails++;
					hint = reviewed.errors.join('\n');
					this._note(hint);
					continue;
				}
				this._map = completeDroxSdtcmLinks(reviewed.map, path);
				await this._persist();
				accepted = true;
				wrote = true;
				this._note(coverageOnly ? `${path} links completed.` : 'Links written.');
			}
			if (!accepted) {
				this._map = completeDroxSdtcmLinks(this._map, path);
				await this._persist();
				refused = true;
				this._note(`${path} links refused.`);
			}
		}
		if (refused) {
			return 'refused';
		}
		return wrote ? 'written' : 'empty';
	}

	private async _tagPass(
		workspace: URI,
		token: number,
		files: readonly string[],
		sources: readonly string[],
		cache: Map<string, string>,
	): Promise<'written' | 'refused' | 'empty' | 'stopped'> {
		let wrote = false;
		let refused = false;
		const fileCatalog = this._tags.filter(tag => tag.scope !== 'folder');
		const folderCatalog = this._tags.filter(tag => tag.scope === 'folder');
		const folders = folderCatalog.length ? droxSdtcmFolders(sources) : [];
		const steps = (fileCatalog.length ? files.length : 0) + folders.length;
		let step = 0;
		if (fileCatalog.length) {
			for (const path of files) {
				if (token !== this._seq) {
					return 'stopped';
				}
				step++;
				this._step = step;
				this._maxSteps = steps;
				this._probeAt('tag', step - 1, steps, path);
				const text = await this._text(workspace, path, cache);
				if (text === undefined) {
					refused = true;
					this._note(`${path} tags refused.`);
					continue;
				}
				const outcome = await this._tagCalls(workspace, token, path, hint => buildDroxSdtcmTagTurn({
					map: this._map,
					file: path,
					text,
					tags: fileCatalog,
					hint,
				}), draft => acceptDroxSdtcmTags(this._map, path, draft, fileCatalog));
				if (outcome === 'stopped') {
					return 'stopped';
				}
				if (outcome === 'refused') {
					refused = true;
				} else if (outcome === 'written') {
					wrote = true;
				}
			}
		}
		for (const folder of folders) {
			if (token !== this._seq) {
				return 'stopped';
			}
			step++;
			this._step = step;
			this._maxSteps = steps;
			const direct = sources.filter(path => droxSdtcmFolderOf(path) === folder).sort();
			this._probeAt('tag', step - 1, steps, folder);
			const outcome = await this._tagCalls(workspace, token, folder, hint => buildDroxSdtcmFolderTagTurn({
				folder,
				files: direct,
				tags: folderCatalog,
				hint,
			}), draft => acceptDroxSdtcmFolderTags(this._map, folder, draft, folderCatalog));
			if (outcome === 'stopped') {
				return 'stopped';
			}
			if (outcome === 'refused') {
				refused = true;
			} else if (outcome === 'written') {
				wrote = true;
			}
		}
		if (refused) {
			return 'refused';
		}
		return wrote ? 'written' : 'empty';
	}

	private async _tagCalls(
		workspace: URI,
		token: number,
		label: string,
		turn: (hint: string) => string,
		accept: (marks: readonly IDroxSdtcmTagMarkDraft[]) => { readonly ok: true; readonly map: IDroxSdtcmMap } | { readonly ok: false; readonly errors: readonly string[] },
	): Promise<'written' | 'refused' | 'stopped'> {
		let hint = '';
		let jsonFails = 0;
		for (let call = 0; call < 14 && jsonFails < 3; call++) {
			if (token !== this._seq) {
				return 'stopped';
			}
			const user = turn(hint);
			this._note(this._probePlan ? `${label}` : `Tags — ${this._step}/${this._maxSteps}`);
			this._say('engine', user);
			const raw = await this._ask(workspace, user, 'tag');
			if (token !== this._seq) {
				return 'stopped';
			}
			this._say('agent', raw);
			if (readDroxSdtcmRead(raw)) {
				hint = 'Do not read another file. Return the marks.';
				this._note(hint);
				continue;
			}
			const draft = readDroxSdtcmTagDraft(raw);
			if (!draft.ok) {
				jsonFails++;
				hint = draft.errors.join('\n');
				this._note(hint);
				continue;
			}
			const reviewed = accept(draft.marks);
			if (!reviewed.ok) {
				jsonFails++;
				hint = reviewed.errors.join('\n');
				this._note(hint);
				continue;
			}
			this._map = reviewed.map;
			await this._persist();
			this._note('Tags written.');
			return 'written';
		}
		this._note(`${label} tags refused.`);
		return 'refused';
	}

	private async _writeDisplay(): Promise<void> {
		if (!this._workspace) {
			return;
		}
		const saved: IDroxSdtcmSavedDisplay = {
			kinds: [...this._display.kinds],
			forms: [...this._display.forms],
			links: this._display.links,
			move: this._display.move,
			focus: this._display.focus,
			visibleTags: [...this._display.visibleTags],
		};
		await writeDroxSdtcmDisplay(this.fileService, this._workspace, saved);
	}

	private async _writeTags(): Promise<void> {
		if (!this._workspace) {
			return;
		}
		await writeDroxSdtcmTags(this.fileService, this._workspace, this._tags);
	}

	private async _ask(workspace: URI, user: string, mode: 'build' | 'align' | 'data' | 'trace' | 'link' | 'tag'): Promise<string> {
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
			temperature: 0,
			fetchHttp: (url, hdrs, options) => this.engineService.fetchHttp(url, hdrs, options),
		}, droxSdtcmSystemPrompt(mode), user, 180_000);
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

	/** Where the consistency run is, from the turns and the files still expected in each phase. */
	private _probeAt(phase: DroxSdtcmProbePhase, index: number, total: number, path: string): void {
		const plan = this._probePlan;
		if (!plan || !plan.phases.length || !plan.turns) {
			return;
		}
		const phaseIndex = Math.max(0, plan.phases.indexOf(phase));
		const within = total > 0 ? (index + 1) / total : 1;
		const done = (plan.turn - 1) * plan.phases.length + phaseIndex + within;
		const percent = Math.min(100, Math.round(100 * done / (plan.turns * plan.phases.length)));
		this._progress = `${percent}%`;
		this._message = `Turn ${plan.turn}/${plan.turns} · ${phase} · ${index + 1}/${total} · ${path} · ${percent}%`;
		this._emit();
	}

	private _note(line: string): void {
		if (!this._probePlan) {
			this._message = line;
		}
		this._journal = [...this._journal, line].slice(-14);
		this._emit();
	}

	private _say(role: IDroxSdtcmExchange['role'], text: string): void {
		this._exchanges = [...this._exchanges, { role, text }];
		this._emit();
	}

	private async _persist(): Promise<void> {
		if (this._holdStore || !this._workspace) {
			return;
		}
		await writeDroxSdtcmStore(this.fileService, this._workspace, this._map, this._baseline);
	}

	private _emit(): void {
		this._onDidChange.fire(this.getSnapshot());
	}
}

function droxSdtcmFolderOf(file: string): string {
	const parts = file.split('/');
	if (parts.length < 2) {
		return '(root)';
	}
	return parts.slice(0, -1).join('/');
}

function droxSdtcmFolders(files: readonly string[]): string[] {
	const found = new Set<string>();
	for (const file of files) {
		let current: string | undefined = droxSdtcmFolderOf(file);
		while (current) {
			found.add(current);
			const slash = current.lastIndexOf('/');
			current = current === '(root)' ? undefined : slash === -1 ? undefined : current.slice(0, slash);
		}
	}
	return [...found].sort();
}

function cloneDroxSdtcmMap(map: IDroxSdtcmMap): IDroxSdtcmMap {
	return JSON.parse(JSON.stringify(map)) as IDroxSdtcmMap;
}

function cloneDroxSdtcmBaseline(baseline: IDroxSdtcmBaseline): IDroxSdtcmBaseline {
	return JSON.parse(JSON.stringify(baseline)) as IDroxSdtcmBaseline;
}

registerSingleton(IDroxSdtcmService, DroxSdtcmService, InstantiationType.Delayed);
