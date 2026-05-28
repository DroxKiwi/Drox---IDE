/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as http from 'http';
import * as https from 'https';

export interface IDroxLocalHttpResult {
	readonly statusCode: number;
	readonly body: string;
}

const DEFAULT_TIMEOUT_MS = 12_000;

export function droxLocalHttpGet(
	url: string,
	timeoutMs = DEFAULT_TIMEOUT_MS,
	headers?: Record<string, string>,
): Promise<IDroxLocalHttpResult> {
	return new Promise((resolve, reject) => {
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch (e) {
			reject(e);
			return;
		}
		const lib = parsed.protocol === 'https:' ? https : http;
		const req = lib.get(
			url,
			{ timeout: timeoutMs, headers },
			res => {
				const chunks: Buffer[] = [];
				res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
				res.on('end', () => {
					resolve({
						statusCode: res.statusCode ?? 0,
						body: Buffer.concat(chunks).toString('utf8'),
					});
				});
			},
		);
		req.on('timeout', () => {
			req.destroy();
			reject(new Error(`timeout after ${timeoutMs}ms`));
		});
		req.on('error', reject);
	});
}
