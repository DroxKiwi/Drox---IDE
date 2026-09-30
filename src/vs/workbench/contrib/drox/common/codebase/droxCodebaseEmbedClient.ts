/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxEngineService } from '../droxEngineService.js';

export interface IDroxEmbedStatus {
	readonly built: boolean;
	readonly backend: string;
	readonly modelLoaded: boolean;
	readonly modelPath?: string;
	readonly dimensions?: number;
}

export interface IDroxEmbedEncodeResult {
	readonly vectors: readonly { readonly values: readonly number[] }[];
}

/**
 * JSON-RPC client for drox.exe embed.* methods (CB2).
 */
export class DroxCodebaseEmbedClient {

	constructor(
		private readonly engine: IDroxEngineService,
	) { }

	async status(): Promise<IDroxEmbedStatus> {
		await this.engine.start();
		await this.engine.initialize();
		const raw = await this.engine.request('embed.status', {}) as IDroxEmbedStatus;
		return {
			built: !!raw?.built,
			backend: raw?.backend ?? 'none',
			modelLoaded: !!raw?.modelLoaded,
			modelPath: raw?.modelPath,
			dimensions: raw?.dimensions,
		};
	}

	async load(modelPath: string): Promise<IDroxEmbedStatus> {
		await this.engine.start();
		await this.engine.initialize();
		return await this.engine.request('embed.load', { modelPath }) as IDroxEmbedStatus;
	}

	async encode(texts: readonly string[]): Promise<IDroxEmbedEncodeResult> {
		await this.engine.start();
		await this.engine.initialize();
		return await this.engine.request('embed.encode', { texts: [...texts] }) as IDroxEmbedEncodeResult;
	}
}
