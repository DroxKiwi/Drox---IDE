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
import { DroxSetting, readArchitectModel, updateDroxLlmModelEnum } from '../common/droxConfiguration.js';
import {
	buildLlmModelListUrl,
	createDroxLlmHttpGet,
	fetchLlmModelNames,
	normalizeLlmServerBaseUrl,
	resolveLlmCatalogConnection,
} from '../common/droxLlmCatalog.js';
import { IDroxEngineService } from '../common/droxEngineService.js';
import { IDroxLlmModelsService, IDroxLlmModelsSnapshot } from '../common/droxLlmModelsService.js';

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
	) {
		super();

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(DroxSetting.ArchitectModel)
				|| e.affectsConfiguration(DroxSetting.Model)
				|| e.affectsConfiguration(DroxSetting.ExecutorModel)
				|| e.affectsConfiguration(DroxSetting.SubagentsModel)
				|| e.affectsConfiguration(DroxSetting.NumCtx)
				|| e.affectsConfiguration(DroxSetting.TopP)
				|| e.affectsConfiguration(DroxSetting.Temperature)
				|| e.affectsConfiguration(DroxSetting.SubagentsNumCtx)
			) {
				this._snapshot = { ...this._snapshot, selected: this.readSelectedModel() };
				this._onDidChange.fire(this._snapshot);
				return;
			}
			if (
				e.affectsConfiguration(DroxSetting.Server)
				|| e.affectsConfiguration(DroxSetting.LlmProvider)
				|| e.affectsConfiguration(DroxSetting.ApiKey)
			) {
				void this.refresh();
			}
		}));
	}

	async refresh(): Promise<void> {
		const generation = ++this._refreshGeneration;
		this._setSnapshot({ ...this._snapshot, loading: true, error: undefined });
		const resource = this.workspaceResource();
		const { provider, server: configuredServer, apiKey } = await resolveLlmCatalogConnection(
			this.configurationService,
			this.fileService,
			resource,
		);
		const server = normalizeLlmServerBaseUrl(configuredServer);
		const selected = this.readSelectedModel();
		const listTarget = buildLlmModelListUrl(provider, configuredServer);
		const httpGet = createDroxLlmHttpGet(
			(url, headers) => this.droxEngineService.fetchHttp(url, headers),
			this.requestService,
			apiKey,
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

		updateDroxLlmModelEnum(models);

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
		const resource = this.workspaceResource();
		return readArchitectModel(this.configurationService, resource ?? undefined);
	}

	private _setSnapshot(next: IDroxLlmModelsSnapshot): void {
		this._snapshot = next;
		this._onDidChange.fire(this._snapshot);
	}
}
