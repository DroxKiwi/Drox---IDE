/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import {
	getDroxReleaseNotesProductVersion,
	hasSeenDroxReleaseNotes,
} from '../common/droxReleaseNotes.js';
import { IDroxReleaseNotesService } from '../common/droxReleaseNotesService.js';

class DroxReleaseNotesContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxReleaseNotes';

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IProductService private readonly productService: IProductService,
		@IDroxReleaseNotesService private readonly releaseNotesService: IDroxReleaseNotesService,
	) {
		super();
		const version = getDroxReleaseNotesProductVersion(this.productService);
		if (!version || hasSeenDroxReleaseNotes(this.storageService, version)) {
			return;
		}
		void this.releaseNotesService.showReleaseNotes();
	}
}

registerWorkbenchContribution2(
	DroxReleaseNotesContribution.ID,
	DroxReleaseNotesContribution,
	WorkbenchPhase.AfterRestored,
);
