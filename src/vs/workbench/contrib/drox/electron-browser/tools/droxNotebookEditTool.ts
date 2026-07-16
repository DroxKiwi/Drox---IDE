/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import {
	applyNotebookCellEdits,
	normalizeNotebookEditInput,
	serializeNotebook,
} from '../../common/droxNotebookEdit.js';
import { IDroxToolExecParams, IDroxToolExecResult } from '../../common/droxClientTools.js';
import { unifiedDiff } from '../../common/droxUnifiedDiff.js';
import { DroxFileToolHost } from './droxFileToolHost.js';
import { resolveExistingFileUnderWorkspace } from './droxPathUtils.js';

const MAX_NOTEBOOK_BYTES = 512 * 1024;

export function createDroxNotebookEditToolHandler(
	host: DroxFileToolHost,
	fileService: IFileService,
): (p: IDroxToolExecParams) => Promise<IDroxToolExecResult> {
	return async (p: IDroxToolExecParams): Promise<IDroxToolExecResult> => {
		let args;
		try {
			args = normalizeNotebookEditInput(p.input);
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

		const lower = args.path.toLowerCase();
		if (!lower.endsWith('.ipynb')) {
			return {
				output: { error: 'notebook_edit: path must end with .ipynb' },
				isError: true,
			};
		}

		let absPath: string;
		try {
			absPath = await resolveExistingFileUnderWorkspace(fileService, p.workspace, args.path, !!p.allowOutsideWorkspace);
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
		if (stat.size > MAX_NOTEBOOK_BYTES) {
			return {
				output: {
					error: `file too large (${stat.size} bytes > ${MAX_NOTEBOOK_BYTES} bytes limit)`,
				},
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

		let nb: Record<string, unknown>;
		try {
			nb = JSON.parse(original) as Record<string, unknown>;
		} catch (e) {
			return {
				output: {
					error: `invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
				},
				isError: true,
			};
		}

		const cells = nb.cells;
		if (!Array.isArray(cells)) {
			return {
				output: { error: 'notebook missing top-level "cells" array' },
				isError: true,
			};
		}

		try {
			applyNotebookCellEdits(cells, args.edits);
		} catch (e) {
			return {
				output: { error: e instanceof Error ? e.message : String(e) },
				isError: true,
			};
		}

		let updated: string;
		try {
			updated = serializeNotebook(nb);
		} catch (e) {
			return {
				output: {
					error: `serialize failed: ${e instanceof Error ? e.message : String(e)}`,
				},
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
				output: { error: 'plan mode forbids write operation: notebook_edit' },
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
				toolLabel: 'notebook_edit',
				confirmMessage: localize('drox.confirmNotebookEdit', 'Apply notebook edits to disk?'),
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
				cell_edits_applied: args.edits.length,
				diff,
			},
		};
	};
}
