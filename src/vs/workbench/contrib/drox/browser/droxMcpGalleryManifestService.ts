/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { dirname } from '../../../../base/common/path.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IMcpGalleryConfig } from '../../../../platform/mcp/common/mcpManagement.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { WorkbenchMcpGalleryManifestService } from '../../../services/mcp/browser/mcpGalleryManifestService.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { resolveDroxBundledMcpRegistryBaseUrl } from '../common/droxMcpRegistry.js';

/**
 * Préfère le registre MCP embarqué (`drox-engine/mcp-registry`) en dev / hors-ligne,
 * puis retombe sur `product.mcpGallery.serviceUrl` (GitHub raw).
 */
export class DroxMcpGalleryManifestService extends WorkbenchMcpGalleryManifestService {

	constructor(
		@IProductService productService: IProductService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IRequestService requestService: IRequestService,
		@ILogService logService: ILogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super(productService, remoteAgentService, requestService, logService, configurationService);
	}

	protected override async getConfiguredGalleryServiceUrl(mcpGalleryConfig: IMcpGalleryConfig | undefined): Promise<string | undefined> {
		if (mcpGalleryConfig?.serviceUrl) {
			return mcpGalleryConfig.serviceUrl;
		}

		const bundled = await resolveDroxBundledMcpRegistryBaseUrl(this.fileService, {
			workspaceFolderPaths: this.workspaceContextService.getWorkspace().folders.map(f => f.uri.fsPath),
			appRoot: this.environmentService.appRoot,
			installDir: dirname(this.environmentService.execPath),
		});
		if (bundled) {
			this.logService.trace('Drox MCP registry: using bundled catalog at', bundled);
			return bundled;
		}

		return super.getConfiguredGalleryServiceUrl(mcpGalleryConfig);
	}
}
