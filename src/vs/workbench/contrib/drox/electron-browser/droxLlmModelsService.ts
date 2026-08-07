/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { DroxSetting, updateDroxLlmModelEnum } from '../common/droxConfiguration.js';
import { isDroxEmbeddingModelId } from '../common/droxAgentsModels.js';
import { readDroxArchitectModelUser } from '../common/droxAgentsConfiguration.js';
import { droxConfigChangeAffectsArchitectSettings, droxLlmSnapshotDiffersFromConfiguration } from '../common/droxChatConfigSync.js';
import {
	buildLlmModelListUrl,
	createDroxLlmHttpGet,
	fetchLlmModelNames,
	normalizeLlmServerBaseUrl,
	resolveLlmCatalogConnection,
} from '../common/droxLlmCatalog.js';
import { IDroxEngineService } from '../common/droxEngineService.js';
import { IDroxLlmModelsService, IDroxLlmModelsSnapshot } from '../common/droxLlmModelsService.js';

/** Attente max du fetch modèles via canal moteur avant repli requestService. */
const DROX_LLM_ENGINE_FETCH_TIMEOUT_MS = 3_000;

export class DroxLlmModelsService extends Disposable implements IDroxLlmModelsService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<IDroxLlmModelsSnapshot>());
	readonly onDidChange: Event<IDroxLlmModelsSnapshot> = this._onDidChange.event;

	private _snapshot: IDroxLlmModelsSnapshot = {
		provider: 'ollama',
		server: '',
		models: [],
		selected: '',
		loading: false,
	};

	private _refreshGeneration = 0;

	get snapshot(): IDroxLlmModelsSnapshot {
		return this._snapshot;
	}

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@IRequestService private readonly requestService: IRequestService,
		@IDroxEngineService private readonly droxEngineService: IDroxEngineService,
		@ILogService private readonly logService: ILogService,
		@IHostService private readonly hostService: IHostService,
	) {
		super();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (droxConfigChangeAffectsArchitectSettings(e)) {
				this._snapshot = { ...this._snapshot, selected: this.readSelectedModel() };
				this._onDidChange.fire(this._snapshot);
				return;
			}
			if (
				e.affectsConfiguration(DroxSetting.Server)
				|| e.affectsConfiguration(DroxSetting.LlmProvider)
				|| e.affectsConfiguration(DroxSetting.ApiKey)
				|| e.affectsConfiguration(DroxSetting.LlmHeaders)
			) {
				void this.refresh();
			}
		}));
		this._register(this.hostService.onDidChangeFocus(focus => {
			if (!focus) {
				return;
			}
			const workspaceResource = this.workspaceResource();
			if (droxLlmSnapshotDiffersFromConfiguration(this._snapshot, this.configurationService, workspaceResource)) {
				void this.refresh();
			}
		}));
	}

	async refresh(): Promise<void> {
		const generation = ++this._refreshGeneration;
		this._setSnapshot({ ...this._snapshot, loading: true, error: undefined });
		const resource = this.workspaceResource();
		const { provider, server: configuredServer, apiKey, headers } = await resolveLlmCatalogConnection(
			this.configurationService,
			this.fileService,
			resource,
		);
		const server = normalizeLlmServerBaseUrl(configuredServer);
		const selected = this.readSelectedModel();
		const listTarget = buildLlmModelListUrl(provider, configuredServer);
		const httpGet = createDroxLlmHttpGet(
			(url, hdrs) => this.droxEngineService.fetchHttp(url, hdrs),
			this.requestService,
			apiKey,
			headers,
			{ provider, server: configuredServer },
			{ mainFetchTimeoutMs: DROX_LLM_ENGINE_FETCH_TIMEOUT_MS },
		);

		let models: string[] = [];
		let error: string | undefined;
		let listUrl: string | undefined;

		if ('error' in listTarget) {
			error = listTarget.error;
		} else {
			listUrl = listTarget.url;
			const result = await fetchLlmModelNames(httpGet, provider, configuredServer);
			if (generation !== this._refreshGeneration) {
				return;
			}
			models = [...result.models];
			listUrl = result.listUrl ?? listUrl;
			error = result.error;
			this.logService.info(`[Drox] Modèles: GET ${listUrl} → ${models.length} modèle(s)${error ? ` (${error})` : ''}`);
		}

		if (generation !== this._refreshGeneration) {
			return;
		}

		updateDroxLlmModelEnum(models.filter(model => !isDroxEmbeddingModelId(model)));

		this._setSnapshot({
			provider,
			server,
			models,
			selected,
			error,
			listUrl,
			loading: false,
		});
	}

	private workspaceResource() {
		return this.workspaceContextService.getWorkspace().folders[0]?.uri;
	}

	private readSelectedModel(): string {
		return readDroxArchitectModelUser(this.configurationService);
	}

	private _setSnapshot(next: IDroxLlmModelsSnapshot): void {
		this._snapshot = next;
		this._onDidChange.fire(this._snapshot);
	}
}
