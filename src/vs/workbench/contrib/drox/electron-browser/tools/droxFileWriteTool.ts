/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';

import { IDroxToolExecParams, IDroxToolExecResult } from '../../common/droxClientTools.js';

import { unifiedDiff } from '../../common/droxUnifiedDiff.js';

import { IFileService } from '../../../../../platform/files/common/files.js';
import { DroxFileToolHost } from './droxFileToolHost.js';
import { resolvePathForWrite } from './droxPathUtils.js';



interface IFileWriteInput {

	path: string;

	content: string;

}



function parseInput(input: unknown): IFileWriteInput {

	if (!input || typeof input !== 'object') {

		throw new Error('file_write: input must be an object');

	}

	const o = input as Record<string, unknown>;

	if (typeof o.path !== 'string' || typeof o.content !== 'string') {

		throw new Error('file_write: input requires string fields `path` and `content`');

	}

	return { path: o.path, content: o.content };

}



export function createDroxFileWriteToolHandler(host: DroxFileToolHost, fileService: IFileService): (p: IDroxToolExecParams) => Promise<IDroxToolExecResult> {

	return async (p) => {

		const args = parseInput(p.input);

		const absPath = await resolvePathForWrite(fileService, p.workspace, args.path);

		const pathForModel = absPath.replace(/\\/g, '/');



		if (p.planMode) {

			return {

				output: { error: 'plan mode forbids write operation: file_write' },

				isError: true,

			};

		}



		if (!p.applyFsWrites) {

			return {

				output: {

					applied: false,

					proposed: true,

					path: pathForModel,

					content: args.content,

				},

			};

		}



		let before = '';

		if (await host.fileExists(absPath)) {

			before = await host.readTextFile(absPath);

		}

		const diff = unifiedDiff(pathForModel, before, args.content);



		if (host.shouldConfirmFileWrites(p.workspace)) {

			const confirmed = await host.confirmWriteAfterDiff({

				workspaceRoot: p.workspace,

				absPath,

				proposedContent: args.content,

				toolLabel: 'file_write',

				confirmMessage: localize('drox.confirmFileWrite', 'Apply file write to disk?'),

			});

			if (!confirmed) {

				return {

					output: {

						applied: false,

						cancelled: true,

						path: pathForModel,

					},

				};

			}

		}



		await host.writeTextFile(p.workspace, absPath, args.content);



		return {

			output: {

				applied: true,

				path: pathForModel,

				bytes_written: args.content.length,

				diff,

			},

		};

	};

}


