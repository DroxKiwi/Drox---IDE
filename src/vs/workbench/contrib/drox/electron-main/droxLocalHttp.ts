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

export interface IDroxLocalHttpRequestOptions {
	readonly method?: 'GET' | 'POST';
	readonly headers?: Record<string, string>;
	readonly body?: string;
	readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 12_000;

export function droxLocalHttpGet(
	url: string,
	timeoutMs = DEFAULT_TIMEOUT_MS,
	headers?: Record<string, string>,
): Promise<IDroxLocalHttpResult> {
	return droxLocalHttpRequest(url, { method: 'GET', headers, timeoutMs });
}

export function droxLocalHttpRequest(
	url: string,
	options: IDroxLocalHttpRequestOptions = {},
): Promise<IDroxLocalHttpResult> {
	const method = options.method ?? 'GET';
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const body = options.body;
	return new Promise((resolve, reject) => {
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch (e) {
			reject(e);
			return;
		}
		const lib = parsed.protocol === 'https:' ? https : http;
		const headers: Record<string, string> = { ...(options.headers ?? {}) };
		if (body !== undefined && method !== 'GET' && !headers['Content-Type'] && !headers['content-type']) {
			headers['Content-Type'] = 'application/json';
		}
		if (body !== undefined && !headers['Content-Length'] && !headers['content-length']) {
			headers['Content-Length'] = String(Buffer.byteLength(body, 'utf8'));
		}
		const req = lib.request(
			{
				protocol: parsed.protocol,
				hostname: parsed.hostname,
				port: parsed.port || undefined,
				path: `${parsed.pathname}${parsed.search}`,
				method,
				timeout: timeoutMs,
				headers,
			},
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
		if (body !== undefined && method !== 'GET') {
			req.write(body, 'utf8');
		}
		req.end();
	});
}
