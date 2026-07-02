/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IDroxFileChangePayload } from './droxFileChange.js';

export interface IDroxSessionFileChangeEvent {
	readonly sessionResource: URI;
	readonly change: IDroxFileChangePayload;
}

export const IDroxSessionChangesBridge = createDecorator<IDroxSessionChangesBridge>('droxSessionChangesBridge');

export interface IDroxSessionChangesBridge {
	readonly _serviceBrand: undefined;
	readonly onDidApplyFileChange: Event<IDroxSessionFileChangeEvent>;
	notifyFileChange(sessionResource: URI, change: IDroxFileChangePayload): void;
}

export class DroxSessionChangesBridge extends Disposable implements IDroxSessionChangesBridge {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidApplyFileChange = this._register(new Emitter<IDroxSessionFileChangeEvent>());
	readonly onDidApplyFileChange = this._onDidApplyFileChange.event;

	notifyFileChange(sessionResource: URI, change: IDroxFileChangePayload): void {
		this._onDidApplyFileChange.fire({ sessionResource, change });
	}
}
