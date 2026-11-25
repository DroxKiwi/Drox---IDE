/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IDroxWorkspaceCheckpointRecord {
	readonly id: string;
	readonly messageIndex: number;
	readonly createdAt: string;
	readonly runId?: string;
	readonly revertCommitId?: string;
	readonly filesCount?: number;
	readonly messageId?: string;
}

export const IDroxWorkspaceCheckpointService = createDecorator<IDroxWorkspaceCheckpointService>('droxWorkspaceCheckpointService');

export interface IDroxWorkspaceCheckpointService {
	readonly _serviceBrand: undefined;
	/**
	 * Enregistre un point de restauration (manifest sous `.drox/checkpoints/`).
	 */
	recordCheckpoint(
		workspaceUri: URI,
		messageIndex: number,
		correlation?: {
			readonly runId?: string;
			readonly revertCommitId?: string;
			readonly filesCount?: number;
			readonly messageId?: string;
		},
	): Promise<IDroxWorkspaceCheckpointRecord | undefined>;
	listCheckpoints(workspaceUri: URI): Promise<readonly IDroxWorkspaceCheckpointRecord[]>;
}