/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IDroxWorkspaceCheckpointRecord, IDroxWorkspaceCheckpointService } from '../common/droxWorkspaceCheckpointService.js';

const MANIFEST = 'manifest.jsonl';

export class DroxWorkspaceCheckpointService implements IDroxWorkspaceCheckpointService {
	declare readonly _serviceBrand: undefined;

	constructor(@IFileService private readonly fileService: IFileService) { }

	private checkpointsDir(workspaceUri: URI): URI {
		return URI.joinPath(workspaceUri, '.drox', 'checkpoints');
	}

	async recordCheckpoint(
		workspaceUri: URI,
		messageIndex: number,
		correlation?: {
			readonly runId?: string;
			readonly revertCommitId?: string;
			readonly filesCount?: number;
			readonly messageId?: string;
		},
	): Promise<IDroxWorkspaceCheckpointRecord | undefined> {
		const dir = this.checkpointsDir(workspaceUri);
		try {
			await this.fileService.createFolder(dir);
		} catch {
			// dir may exist
		}
		const record: IDroxWorkspaceCheckpointRecord = {
			id: correlation?.revertCommitId
				? `ckpt_${correlation.revertCommitId}`
				: `ckpt_${generateUuid()}`,
			messageIndex,
			createdAt: new Date().toISOString(),
			runId: correlation?.runId,
			revertCommitId: correlation?.revertCommitId,
			filesCount: correlation?.filesCount,
			messageId: correlation?.messageId,
		};
		const line = `${JSON.stringify(record)}\n`;
		const manifestUri = URI.joinPath(dir, MANIFEST);
		let prior = '';
		try {
			const existing = await this.fileService.readFile(manifestUri);
			prior = existing.value.toString();
		} catch {
			// new manifest
		}
		await this.fileService.writeFile(manifestUri, VSBuffer.fromString(prior + line));
		return record;
	}

	async listCheckpoints(workspaceUri: URI): Promise<readonly IDroxWorkspaceCheckpointRecord[]> {
		const manifestUri = URI.joinPath(this.checkpointsDir(workspaceUri), MANIFEST);
		try {
			const content = await this.fileService.readFile(manifestUri);
			const lines = content.value.toString().split('\n').filter(l => l.trim().length > 0);
			const out: IDroxWorkspaceCheckpointRecord[] = [];
			for (const line of lines) {
				try {
					const parsed = JSON.parse(line) as IDroxWorkspaceCheckpointRecord;
					if (parsed && typeof parsed.id === 'string') {
						out.push(parsed);
					}
				} catch {
					// skip corrupt line
				}
			}
			return out;
		} catch {
			return [];
		}
	}
}