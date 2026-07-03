/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ISharedProcessService } from '../../../../platform/ipc/electron-browser/services.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { IMcpGalleryManifestService } from '../../../../platform/mcp/common/mcpGalleryManifest.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { INativeWorkbenchEnvironmentService } from '../../environment/electron-browser/environmentService.js';
// eslint-disable-next-line local/code-import-patterns -- Drox curated MCP gallery in workbench service
import { DroxMcpGalleryManifestService } from '../../../contrib/drox/browser/droxMcpGalleryManifestService.js';

export class McpGalleryManifestService extends DroxMcpGalleryManifestService implements IMcpGalleryManifestService {

	constructor(
		@IProductService productService: IProductService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IConfigurationService configurationService: IConfigurationService,
		@IFileService fileService: IFileService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
	) {
		super(productService, remoteAgentService, requestService, logService, configurationService, fileService, environmentService, workspaceContextService);

		const channel = sharedProcessService.getChannel('mcpGalleryManifest');
		this.getMcpGalleryManifest().then(manifest => {
			channel.call('setMcpGalleryManifest', [manifest]);
			this._register(this.onDidChangeMcpGalleryManifest(manifest => channel.call('setMcpGalleryManifest', [manifest])));
		});
	}

}

registerSingleton(IMcpGalleryManifestService, McpGalleryManifestService, InstantiationType.Eager);
