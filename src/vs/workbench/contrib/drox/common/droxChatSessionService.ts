/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IDroxChatSessionService = createDecorator<IDroxChatSessionService>('droxChatSessionService');

/** Session / run courants du panneau chat Drox (pour outils client IDE). */
export interface IDroxChatSessionService {

	readonly _serviceBrand: undefined;

	readonly onDidChangeRunId: Event<string | undefined>;

	readonly onDidChangeRunningSessions: Event<void>;

	getSessionId(): string | undefined;

	getRunId(): string | undefined;

	setSessionId(id: string | undefined): void;

	setRunId(id: string | undefined): void;

	/** Un run moteur est en cours pour cette session (plusieurs sessions peuvent tourner). */
	beginSessionRun(sessionId: string, runId: string): void;

	endSessionRun(sessionId: string, runId: string): void;

	isSessionRunActive(sessionId: string | undefined): boolean;

	hasActiveRun(): boolean;

	getPendingSessionReset(): boolean;

	setPendingSessionReset(value: boolean): void;

}

