/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';

import { applyEdits, parseFileEditInput, validateFileEditScope } from '../../common/droxFileEdit.js';

import { IDroxToolExecParams, IDroxToolExecResult } from '../../common/droxClientTools.js';

import { unifiedDiff } from '../../common/droxUnifiedDiff.js';

import { DroxFileToolHost } from './droxFileToolHost.js';

import { resolveExistingFileUnderWorkspace } from './droxPathUtils.js';



export function createDroxFileEditToolHandler(host: DroxFileToolHost, fileService: IFileService): (p: IDroxToolExecParams) => Promise<IDroxToolExecResult> {

	return async (p) => {

		let args;

		try {

			args = parseFileEditInput(p.input);

		} catch (e) {

			return {

				output: { error: e instanceof Error ? e.message : String(e) },

				isError: true,

			};

		}



		if (args.edits.length === 0) {

			return {

				output: { error: 'edits must not be empty' },

				isError: true,

			};

		}



		let absPath: string;

		try {

			absPath = await resolveExistingFileUnderWorkspace(fileService, p.workspace, args.path);

		} catch (e) {

			return {

				output: { error: e instanceof Error ? e.message : String(e) },

				isError: true,

			};

		}



		const pathForModel = absPath.replace(/\\/g, '/');

		const stat = await fileService.stat(URI.file(absPath));
		if (!stat.isFile) {
			return {
				output: { error: `not a regular file: ${pathForModel}` },
				isError: true,
			};
		}

		let original: string;

		try {

			original = await host.readTextFile(absPath);

		} catch (e) {

			return {

				output: { error: `read failed: ${e instanceof Error ? e.message : String(e)}` },

				isError: true,

			};

		}



		const scopeErr = validateFileEditScope(original, args.edits);
		if (scopeErr) {
			return {
				output: { error: scopeErr },
				isError: true,
			};
		}

		let updated: string;

		try {

			updated = applyEdits(original, args.edits);

		} catch (e) {

			return {

				output: { error: e instanceof Error ? e.message : String(e) },

				isError: true,

			};

		}



		if (updated === original) {

			return {

				output: { error: 'edits produced no change' },

				isError: true,

			};

		}



		const diff = unifiedDiff(pathForModel, original, updated);



		if (p.planMode) {

			return {

				output: { error: 'plan mode forbids write operation: file_edit' },

				isError: true,

			};

		}



		if (!p.applyFsWrites) {

			return {

				output: {

					applied: false,

					proposed: true,

					path: pathForModel,

					new_content: updated,

					diff,

				},

			};

		}



		if (host.shouldConfirmFileWrites(p.workspace)) {

			const confirmed = await host.confirmWriteAfterDiff({

				workspaceRoot: p.workspace,

				absPath,

				proposedContent: updated,

				toolLabel: 'file_edit',

				confirmMessage: localize('drox.confirmFileEdit', 'Apply file edits to disk?'),

			});

			if (!confirmed) {

				return {

					output: {

						applied: false,

						cancelled: true,

						path: pathForModel,

						diff,

					},

				};

			}

		}



		await host.writeTextFile(p.workspace, absPath, updated);



		return {

			output: {

				applied: true,

				path: pathForModel,

				edits_applied: args.edits.length,

				diff,

			},

		};

	};

}


