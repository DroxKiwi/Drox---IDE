/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';
import { DroxSetting } from '../common/droxConfiguration.js';
import { resolveDroxExecutablePath } from '../common/droxExecutable.js';
import { IDroxExecutableService } from '../common/droxExecutableService.js';

export class DroxExecutableService implements IDroxExecutableService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@INativeWorkbenchEnvironmentService private readonly environmentService: INativeWorkbenchEnvironmentService,
	) { }

	resolve(): Promise<string> {
		const configuredPath = this.configurationService.getValue<string>(DroxSetting.ExecutablePath) ?? '';
		const workspaceFolderPaths = this.workspaceContextService.getWorkspace().folders.map(f => f.uri.fsPath);
		return resolveDroxExecutablePath(this.fileService, {
			configuredPath,
			workspaceFolderPaths,
			appRoot: this.environmentService.appRoot,
		});
	}
}
