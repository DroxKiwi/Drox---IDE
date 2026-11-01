/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IDroxToolExecParams, IDroxToolExecResult } from '../../common/droxClientTools.js';
import { IDroxSdtcmService } from '../../browser/sdtcm/droxSdtcmService.js';

/** `sdtcm_align` — SDTCM diff, then the map role resumes where the files diverged. */
export function createDroxSdtcmAlignToolHandler(
	sdtcmService: IDroxSdtcmService,
): (params: IDroxToolExecParams) => Promise<IDroxToolExecResult> {
	return async (params: IDroxToolExecParams): Promise<IDroxToolExecResult> => {
		const raw = (params.input ?? {}) as { note?: string };
		const note = typeof raw.note === 'string' ? raw.note : undefined;
		if (!params.workspace) {
			return { output: { error: 'sdtcm_align: workspace is required.' }, isError: true };
		}
		try {
			const result = await sdtcmService.align(URI.file(params.workspace), note);
			return { output: result, isError: false };
		} catch (error) {
			return {
				output: { error: error instanceof Error ? error.message : String(error) },
				isError: true,
			};
		}
	};
}
