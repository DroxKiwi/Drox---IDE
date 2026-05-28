/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { extname, join, relative } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import {
	decodeDataUrl,
	extFromImageMime,
	IDroxAttachmentPayload,
	IDroxPersistedAttachment,
	sanitizeAttachmentFileName,
} from '../common/droxAttachments.js';
import { IDroxAttachmentsService } from '../common/droxAttachmentsService.js';

export class DroxAttachmentsService implements IDroxAttachmentsService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IFileService private readonly fileService: IFileService,
	) { }

	async persistAttachments(workspaceRoot: string, attachments: readonly IDroxAttachmentPayload[]): Promise<IDroxPersistedAttachment[]> {
		const dirUri = URI.file(join(workspaceRoot, '.drox', 'attachments'));
		await this.fileService.createFolder(dirUri);

		const ts = new Date()
			.toISOString()
			.replace(/[:.]/g, '-')
			.replace('T', '_')
			.slice(0, 19);

		const saved: IDroxPersistedAttachment[] = [];
		let i = 0;
		for (const att of attachments) {
			i += 1;
			const dataUrl = typeof att.dataUrl === 'string' ? att.dataUrl : '';
			const decoded = decodeDataUrl(dataUrl);
			if (!decoded) {
				continue;
			}
			const mime = att.mime ?? decoded.mime ?? 'image/png';
			const base = sanitizeAttachmentFileName(att.name ?? `image-${i}`);
			const hasExt = extname(base) !== '';
			const fileName = `${ts}-${i}-${base}${hasExt ? '' : extFromImageMime(mime)}`;
			const fileUri = URI.file(join(dirUri.fsPath, fileName));
			await this.fileService.writeFile(fileUri, VSBuffer.wrap(decoded.bytes));
			const rel = relative(workspaceRoot, fileUri.fsPath).replaceAll('\\', '/');
			const base64 = encodeBase64(VSBuffer.wrap(decoded.bytes));
			saved.push({ relPath: `./${rel}`, mime, base64 });
		}
		return saved;
	}
}
