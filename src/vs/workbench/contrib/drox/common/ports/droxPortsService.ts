/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Event } from '../../../../../base/common/event.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import {
	IDroxPortsForward,
	IDroxPortsRuntimeState,
	IDroxPortsTool,
} from './droxPortsTypes.js';

export const IDroxPortsService = createDecorator<IDroxPortsService>('droxPortsService');

export interface IDroxPortsService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly tools: readonly IDroxPortsTool[];
	readonly defaultToolId: string | undefined;
	readonly forwards: readonly IDroxPortsForward[];
	getRuntime(forwardId: string): IDroxPortsRuntimeState | undefined;
	setDefaultToolId(id: string | undefined): Promise<void>;
	addTool(input: Omit<IDroxPortsTool, 'id'> & { id?: string }): Promise<IDroxPortsTool>;
	removeTool(id: string): Promise<void>;
	addForward(input: Omit<IDroxPortsForward, 'id' | 'localHost' | 'localPort' | 'protocol' | 'onReady'> & {
		id?: string;
		localHost?: string;
		localPort?: number;
		protocol?: IDroxPortsForward['protocol'];
		onReady?: IDroxPortsForward['onReady'];
		toolId?: string;
	}): Promise<IDroxPortsForward>;
	removeForward(id: string): Promise<void>;
	startForward(id: string): Promise<void>;
	stopForward(id: string): Promise<void>;
	openForward(id: string): Promise<void>;
}
