/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IActiveSession } from '../common/sessionsManagement.js';
import { ISession } from '../common/session.js';

export interface ISessionOpenGateContext {
	readonly from: IActiveSession | undefined;
	readonly toResource: URI;
}

export type SessionOpenGatePrepareResult = 'proceed' | 'cancel';

let prepareGate: ((context: ISessionOpenGateContext) => Promise<SessionOpenGatePrepareResult>) | undefined;
let afterOpenHook: ((session: ISession) => Promise<void>) | undefined;

export function registerSessionOpenGatePrepare(
	fn: (context: ISessionOpenGateContext) => Promise<SessionOpenGatePrepareResult>,
): void {
	prepareGate = fn;
}

export function registerSessionOpenGateAfterOpen(fn: (session: ISession) => Promise<void>): void {
	afterOpenHook = fn;
}

export function invokeSessionOpenGatePrepare(context: ISessionOpenGateContext): Promise<SessionOpenGatePrepareResult> {
	return prepareGate ? prepareGate(context) : Promise.resolve('proceed');
}

export function invokeSessionOpenGateAfterOpen(session: ISession): Promise<void> {
	return afterOpenHook ? afterOpenHook(session) : Promise.resolve();
}
