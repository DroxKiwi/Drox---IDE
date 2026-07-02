/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file



import { URI } from '../../../../base/common/uri.js';

import { ILocalGitService } from '../../../../platform/git/common/localGitService.js';

import { IDroxSessionGitService } from '../common/droxSessionGitService.js';



/** Renderer-safe git helper for Drox sessions — delegates to shared-process `ILocalGitService`. */

export class DroxSessionGitService implements IDroxSessionGitService {



	declare readonly _serviceBrand: undefined;



	constructor(

		@ILocalGitService private readonly _localGitService: ILocalGitService,

	) { }



	async hasUncommittedChanges(workingDirectory: URI): Promise<boolean> {

		return this._localGitService.hasUncommittedChanges(workingDirectory.fsPath);

	}



	async getCurrentBranch(workingDirectory: URI): Promise<string | undefined> {

		return this._localGitService.getCurrentBranch(workingDirectory.fsPath);

	}



	async hasUpstream(workingDirectory: URI, branchName: string): Promise<boolean> {

		return this._localGitService.hasUpstream(workingDirectory.fsPath, branchName);

	}



	async commitAll(workingDirectory: URI, message: string): Promise<void> {

		await this._localGitService.commitAll(workingDirectory.fsPath, message);

	}



	async push(workingDirectory: URI, options?: { readonly setUpstream?: boolean }): Promise<void> {

		await this._localGitService.push(workingDirectory.fsPath, { setUpstream: options?.setUpstream });

	}

}

