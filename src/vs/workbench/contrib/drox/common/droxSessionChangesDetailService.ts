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

import { droxChangeEventKey } from './droxChangeEventKey.js';

import { droxSessionChangePathKey } from './droxPathUtil.js';



export const IDroxSessionChangesDetailService = createDecorator<IDroxSessionChangesDetailService>('droxSessionChangesDetailService');



export interface IDroxSessionChangesDetailService {

	readonly _serviceBrand: undefined;

	readonly onDidChange: Event<URI>;

	getFileChange(sessionResource: URI, filePath: string): IDroxFileChangePayload | undefined;

	getSessionFileChanges(sessionResource: URI): ReadonlyMap<string, IDroxFileChangePayload>;

	getSessionChangeEvents(sessionResource: URI): readonly IDroxFileChangePayload[];

	setSessionChangeEvents(sessionResource: URI, changes: Iterable<IDroxFileChangePayload>): void;

	appendFileChange(sessionResource: URI, change: IDroxFileChangePayload): void;

	mergeSessionChangeEvents(sessionResource: URI, changes: Iterable<IDroxFileChangePayload>): void;

	clearSession(sessionResource: URI): void;

}



export class DroxSessionChangesDetailService extends Disposable implements IDroxSessionChangesDetailService {



	declare readonly _serviceBrand: undefined;



	private readonly _eventsBySession = new Map<string, IDroxFileChangePayload[]>();

	private readonly _onDidChange = this._register(new Emitter<URI>());

	readonly onDidChange = this._onDidChange.event;



	getFileChange(sessionResource: URI, filePath: string): IDroxFileChangePayload | undefined {

		const events = this._eventsBySession.get(sessionResource.toString());

		if (!events?.length) {

			return undefined;

		}

		const key = droxSessionChangePathKey(filePath);

		for (let i = events.length - 1; i >= 0; i--) {

			const change = events[i];

			if (droxSessionChangePathKey(change.path) === key) {

				return change;

			}

		}

		return undefined;

	}



	getSessionFileChanges(sessionResource: URI): ReadonlyMap<string, IDroxFileChangePayload> {

		const events = this._eventsBySession.get(sessionResource.toString());

		if (!events?.length) {

			return new Map();

		}

		const map = new Map<string, IDroxFileChangePayload>();

		for (const change of events) {

			map.set(droxSessionChangePathKey(change.path), change);

		}

		return map;

	}



	getSessionChangeEvents(sessionResource: URI): readonly IDroxFileChangePayload[] {

		return this._eventsBySession.get(sessionResource.toString()) ?? [];

	}



	setSessionChangeEvents(sessionResource: URI, changes: Iterable<IDroxFileChangePayload>): void {

		const next: IDroxFileChangePayload[] = [];

		for (const change of changes) {

			if (change.applied) {

				next.push(change);

			}

		}

		this._eventsBySession.set(sessionResource.toString(), next);

		this._onDidChange.fire(sessionResource);

	}



	appendFileChange(sessionResource: URI, change: IDroxFileChangePayload): void {

		if (!change.applied) {

			return;

		}

		const sessionKey = sessionResource.toString();

		let events = this._eventsBySession.get(sessionKey);

		if (!events) {

			events = [];

			this._eventsBySession.set(sessionKey, events);

		}

		const key = droxChangeEventKey(change, events.length);

		const existingIndex = events.findIndex((e, i) => droxChangeEventKey(e, i) === key);

		if (existingIndex >= 0) {

			events[existingIndex] = change;

		} else {

			events.push(change);

		}

		this._onDidChange.fire(sessionResource);

	}



	mergeSessionChangeEvents(sessionResource: URI, changes: Iterable<IDroxFileChangePayload>): void {

		const sessionKey = sessionResource.toString();

		const result = [...(this._eventsBySession.get(sessionKey) ?? [])];

		const keyIndex = new Map<string, number>();

		for (let i = 0; i < result.length; i++) {

			keyIndex.set(droxChangeEventKey(result[i]!, i), i);

		}

		for (const change of changes) {

			if (!change.applied) {

				continue;

			}

			const key = droxChangeEventKey(change, result.length);

			const existingIndex = keyIndex.get(key);

			if (existingIndex !== undefined) {

				result[existingIndex] = change;

			} else {

				keyIndex.set(key, result.length);

				result.push(change);

			}

		}

		this._eventsBySession.set(sessionKey, result);

		this._onDidChange.fire(sessionResource);

	}



	clearSession(sessionResource: URI): void {

		if (this._eventsBySession.delete(sessionResource.toString())) {

			this._onDidChange.fire(sessionResource);

		}

	}

}


