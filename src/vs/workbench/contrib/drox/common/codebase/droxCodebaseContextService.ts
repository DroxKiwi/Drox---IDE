/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { DroxSetting } from '../droxConfiguration.js';
import { IDroxModelQuestionService } from '../modelQuestions/droxModelQuestionService.js';
import {
	DROX_CODEBASE_AUTO_INJECT_DEFAULT_MAX_CHARS,
	DROX_CODEBASE_AUTO_INJECT_DEFAULT_MAX_HITS,
	DROX_CODEBASE_FORCE_INJECT_MAX_HITS,
	DROX_CODEBASE_RETRIEVAL_HINT,
	formatDroxCodebaseContextBlock,
	mergeDroxSystemSupplements,
} from './droxCodebaseContextPack.js';
import { IDroxCodebaseIndexService } from './droxCodebaseIndexService.js';
import { DroxCodebaseInjectSkip, IDroxCodebaseHit, IDroxCodebaseLastInject } from './droxCodebaseTypes.js';

const DROX_CODEBASE_INJECT_SEARCH_TIMEOUT_MS = 2000;
const DROX_CODEBASE_INJECT_HIT_PREVIEW_MAX = 160;

export const IDroxCodebaseContextService = createDecorator<IDroxCodebaseContextService>('droxCodebaseContextService');

export interface IDroxCodebaseContextService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeForceNext: Event<void>;
	readonly onDidInject: Event<IDroxCodebaseLastInject>;
	readonly lastInject: IDroxCodebaseLastInject | undefined;
	readonly forceNextRun: boolean;
	setForceNextRun(force: boolean): void;
	toggleForceNextRun(): void;
	isAutoInjectEnabled(): boolean;
	buildSystemSupplement(
		workspaceFsPath: string,
		query: string,
		opts?: IDroxCodebaseInjectOpts,
	): Promise<string | undefined>;
}

export interface IDroxCodebaseInjectOpts {
	/** When force is armed: editor-relative path prefixes (file + parent dir). */
	readonly pathPrefixes?: readonly string[];
}

export class DroxCodebaseContextService extends Disposable implements IDroxCodebaseContextService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeForceNext = this._register(new Emitter<void>());
	readonly onDidChangeForceNext = this._onDidChangeForceNext.event;

	private readonly _onDidInject = this._register(new Emitter<IDroxCodebaseLastInject>());
	readonly onDidInject = this._onDidInject.event;

	private _forceNextRun = false;
	private _lastInject: IDroxCodebaseLastInject | undefined;

	constructor(
		@IDroxCodebaseIndexService private readonly indexService: IDroxCodebaseIndexService,
		@IDroxModelQuestionService private readonly modelQuestions: IDroxModelQuestionService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	get forceNextRun(): boolean {
		return this._forceNextRun;
	}

	get lastInject(): IDroxCodebaseLastInject | undefined {
		return this._lastInject;
	}

	setForceNextRun(force: boolean): void {
		if (this._forceNextRun === force) {
			return;
		}
		this._forceNextRun = force;
		this._onDidChangeForceNext.fire();
	}

	toggleForceNextRun(): void {
		this.setForceNextRun(!this._forceNextRun);
	}

	isAutoInjectEnabled(): boolean {
		return this.configurationService.getValue<boolean>(DroxSetting.CodebaseAutoInject) !== false;
	}

	async buildSystemSupplement(
		workspaceFsPath: string,
		query: string,
		opts?: IDroxCodebaseInjectOpts,
	): Promise<string | undefined> {
		const t0 = Date.now();
		const forced = this._forceNextRun;
		if (forced) {
			this.setForceNextRun(false);
		}
		const auto = this.isAutoInjectEnabled();
		const userMessage = query.trim();
		const forcePathPrefixes = forced
			? (opts?.pathPrefixes ?? []).map(p => p.replace(/\\/g, '/')).filter(Boolean)
			: [];

		if (!auto && !forced) {
			this._recordInject({
				at: Date.now(),
				query: userMessage,
				forced: false,
				autoEnabled: false,
				hitCount: 0,
				chars: 0,
				ms: Date.now() - t0,
				hits: [],
				skip: 'disabled',
			});
			return DROX_CODEBASE_RETRIEVAL_HINT;
		}

		const maxCharsRaw = this.configurationService.getValue<number>(DroxSetting.CodebaseAutoInjectMaxChars);
		const maxChars = typeof maxCharsRaw === 'number' && Number.isFinite(maxCharsRaw) && maxCharsRaw > 500
			? Math.floor(maxCharsRaw)
			: DROX_CODEBASE_AUTO_INJECT_DEFAULT_MAX_CHARS;
		const maxHits = forced ? DROX_CODEBASE_FORCE_INJECT_MAX_HITS : DROX_CODEBASE_AUTO_INJECT_DEFAULT_MAX_HITS;

		if (userMessage.length < 2) {
			this._recordInject({
				at: Date.now(),
				query: userMessage,
				forced,
				autoEnabled: auto,
				hitCount: 0,
				chars: 0,
				ms: Date.now() - t0,
				hits: [],
				skip: 'empty_query',
				forcePathPrefixes: forcePathPrefixes.length ? forcePathPrefixes : undefined,
			});
			return DROX_CODEBASE_RETRIEVAL_HINT;
		}

		// 1) Comprehension (English model question) → structured filter
		const filter = await this.modelQuestions.comprehendCodebaseRetrieval(userMessage);
		if (filter?.skipRetrieval && !forced) {
			this._recordInject({
				at: Date.now(),
				query: userMessage,
				forced,
				autoEnabled: auto,
				hitCount: 0,
				chars: 0,
				ms: Date.now() - t0,
				hits: [],
				skip: 'model_skip',
			});
			return DROX_CODEBASE_RETRIEVAL_HINT;
		}

		// 2) Mechanical search from filter (fallback: raw message, no path heuristics).
		// Force+editor prefixes win over model pathPrefixes when present.
		const searchQuery = filter?.searchQuery?.trim() || userMessage;
		const pathPrefixes = forcePathPrefixes.length
			? forcePathPrefixes
			: filter?.pathPrefixes;
		let packText: string | undefined;
		let usedHits: readonly IDroxCodebaseHit[] = [];
		let skip: DroxCodebaseInjectSkip | undefined;

		try {
			const root = URI.file(workspaceFsPath);
			const hits = await raceTimeout(
				this.indexService.search(root, searchQuery, {
					maxResults: maxHits,
					includeLexical: true,
					preferCodeFiles: filter?.preferCodeFiles === true || (forced && forcePathPrefixes.length > 0),
					pathPrefixes,
				}),
				DROX_CODEBASE_INJECT_SEARCH_TIMEOUT_MS,
			);
			if (hits === undefined) {
				skip = 'timeout';
			} else if (!hits.length) {
				skip = 'no_hits';
			} else {
				const pack = formatDroxCodebaseContextBlock(hits, {
					maxChars,
					forced,
					query: searchQuery,
				});
				if (pack) {
					packText = pack.text;
					usedHits = slimInjectHits(hits.slice(0, pack.hitCount));
					this.logService.trace(`[drox-codebase] CB4 pack hits=${pack.hitCount} chars=${pack.chars} forced=${forced} variant=${filter?.variantId ?? 'none'}`);
				} else {
					skip = 'no_hits';
				}
			}
		} catch (err) {
			skip = 'error';
			this.logService.trace(`[drox-codebase] CB4 context pack skipped: ${err}`);
		}

		this._recordInject({
			at: Date.now(),
			query: searchQuery,
			forced,
			autoEnabled: auto,
			hitCount: usedHits.length,
			chars: packText?.length ?? 0,
			ms: Date.now() - t0,
			hits: usedHits,
			skip,
			forcePathPrefixes: forcePathPrefixes.length ? forcePathPrefixes : undefined,
		});

		return mergeDroxSystemSupplements(DROX_CODEBASE_RETRIEVAL_HINT, packText);
	}

	private _recordInject(rec: IDroxCodebaseLastInject): void {
		this._lastInject = rec;
		this._onDidInject.fire(rec);
	}
}

function slimInjectHits(hits: readonly IDroxCodebaseHit[]): IDroxCodebaseHit[] {
	return hits.map(h => ({
		path: h.path,
		startLine: h.startLine,
		endLine: h.endLine,
		score: h.score,
		symbol: h.symbol,
		preview: h.preview.length > DROX_CODEBASE_INJECT_HIT_PREVIEW_MAX
			? `${h.preview.slice(0, DROX_CODEBASE_INJECT_HIT_PREVIEW_MAX)}…`
			: h.preview,
	}));
}
