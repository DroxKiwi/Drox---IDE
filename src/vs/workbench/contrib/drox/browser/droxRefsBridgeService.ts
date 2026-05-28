/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { IDroxRefsBridgeService } from '../common/droxRefsBridgeService.js';

export class DroxRefsBridgeService implements IDroxRefsBridgeService {
	declare readonly _serviceBrand: undefined;

	private readonly _onAppendReferences = new Emitter<readonly string[]>();
	readonly onAppendReferences = this._onAppendReferences.event;

	postReferences(uris: readonly string[]): void {
		if (uris.length > 0) {
			this._onAppendReferences.fire(uris);
		}
	}
}
