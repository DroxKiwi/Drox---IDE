/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { VSBuffer } from '../../../../../base/common/buffer.js';

import { Schemas } from '../../../../../base/common/network.js';

import { basename, dirname, relative } from '../../../../../base/common/path.js';

import { URI } from '../../../../../base/common/uri.js';

import { generateUuid } from '../../../../../base/common/uuid.js';

import { ILanguageService } from '../../../../../editor/common/languages/language.js';

import { IModelService } from '../../../../../editor/common/services/model.js';

import { localize } from '../../../../../nls.js';

import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';

import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';

import { IFileService } from '../../../../../platform/files/common/files.js';

import { ICommandService } from '../../../../../platform/commands/common/commands.js';

import { DroxSetting } from '../../common/droxConfiguration.js';
import { shouldSkipStackedFileWriteConfirm } from '../../common/droxPermissionAsk.js';
import { IDroxUserAskService } from '../../common/droxUserAskService.js';
import { IDroxRunRevertService } from '../../common/droxRunRevertService.js';
import { languageIdForFile } from './droxPathUtils.js';



const MAX_READ_BYTES = 512 * 1024;



export class DroxFileToolHost {



	constructor(

		@IConfigurationService private readonly configurationService: IConfigurationService,

		@ICommandService private readonly commandService: ICommandService,

		@IDialogService private readonly dialogService: IDialogService,

		@IFileService private readonly fileService: IFileService,

		@IModelService private readonly modelService: IModelService,

		@ILanguageService private readonly languageService: ILanguageService,

		@IDroxUserAskService private readonly userAskService: IDroxUserAskService,

		@IDroxRunRevertService private readonly runRevertService: IDroxRunRevertService,

	) { }



	shouldConfirmFileWrites(workspaceRoot: string): boolean {
		// AMB-16 : permission Ask / Trust couvrent déjà la confirm — pas de 2e dialog.
		if (shouldSkipStackedFileWriteConfirm(this.userAskService.getActivePermissionMode())) {
			return false;
		}
		return this.configurationService.getValue<boolean>(DroxSetting.ConfirmFileWrites, { resource: URI.file(workspaceRoot) }) ?? false;
	}



	async readTextFile(absPath: string): Promise<string> {

		const stat = await this.fileService.stat(URI.file(absPath));

		if (stat.size > MAX_READ_BYTES) {

			throw new Error(`file too large (${stat.size} bytes > ${MAX_READ_BYTES} bytes limit)`);

		}

		const content = await this.fileService.readFile(URI.file(absPath));

		return content.value.toString();

	}



	async writeTextFile(workspaceRoot: string, absPath: string, content: string): Promise<void> {

		await this.runRevertService.captureBeforeWrite(workspaceRoot, absPath);

		const uri = URI.file(absPath);

		await this.fileService.createFolder(URI.file(dirname(absPath)));

		await this.fileService.writeFile(uri, VSBuffer.fromString(content));

	}



	async fileExists(absPath: string): Promise<boolean> {

		return this.fileService.exists(URI.file(absPath));

	}



	/**

	 * Ouvre un diff (fichier existant ou vide vs contenu proposé) et demande confirmation.

	 * @returns `true` si l'utilisateur choisit d'appliquer.

	 */

	async confirmWriteAfterDiff(opts: {

		workspaceRoot: string;

		absPath: string;

		proposedContent: string;

		toolLabel: string;

		confirmMessage: string;

	}): Promise<boolean> {

		const lang = languageIdForFile(opts.absPath);

		const languageSelection = this.languageService.createById(lang);



		let leftUri: URI;

		if (await this.fileExists(opts.absPath)) {

			leftUri = URI.file(opts.absPath);

		} else {

			leftUri = URI.from({ scheme: Schemas.untitled, path: `drox-left-${generateUuid()}` });

			this.modelService.createModel('', languageSelection, leftUri, false);

		}



		const rightUri = URI.from({ scheme: Schemas.untitled, path: `drox-right-${generateUuid()}` });

		this.modelService.createModel(opts.proposedContent, languageSelection, rightUri, false);



		const rel = relative(opts.workspaceRoot, opts.absPath);

		const title = `Drox — ${opts.toolLabel} (${rel || basename(opts.absPath)})`;

		await this.commandService.executeCommand('vscode.diff', leftUri, rightUri, title, { preview: true });



		const { confirmed } = await this.dialogService.confirm({

			type: 'question',

			message: opts.confirmMessage,

			primaryButton: localize({ key: 'drox.applyFileWrite', comment: ['&& denotes a mnemonic'] }, '&&Apply'),

			cancelButton: localize('drox.cancelFileWrite', 'Cancel'),

		});

		return confirmed;
	}
}

