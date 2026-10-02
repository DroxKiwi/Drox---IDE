/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IDroxCodebaseHit, IDroxCodebasePipelineEvent } from './droxCodebaseTypes.js';

export const IDroxCodebaseIndexService = createDecorator<IDroxCodebaseIndexService>('droxCodebaseIndexService');

export interface IDroxCodebaseSearchOptions {
	readonly maxResults?: number;
	readonly pathPrefix?: string;
	/** From model comprehension filter — applied at re-rank. */
	readonly pathPrefixes?: readonly string[];
	/** From model comprehension filter — enable code-oriented path multipliers. */
	readonly preferCodeFiles?: boolean;
	readonly includeLexical?: boolean;
}

/**
 * Workspace-scoped codebase index (one instance per canonical root path).
 * CB1: lexical metadata; CB2+: embeddings / hybrid; CB2b: incremental + pipeline events.
 */
export interface IDroxCodebaseIndexService {
	readonly _serviceBrand: undefined;
	/** Live steps from scan → chunk → embed → write (cockpit journal). */
	readonly onDidPipelineEvent: Event<IDroxCodebasePipelineEvent>;

	ensureIndexed(workspaceRoot: URI): Promise<void>;
	search(workspaceRoot: URI, query: string, opts?: IDroxCodebaseSearchOptions): Promise<readonly IDroxCodebaseHit[]>;
	invalidate(workspaceRoot: URI, paths: readonly URI[]): Promise<void>;
	purge(workspaceRoot: URI): Promise<void>;
	pause(workspaceRoot: URI): void;
	resume(workspaceRoot: URI): void;
	/** Load manifest stats for cockpit (undefined if no index yet). */
	getManifest(workspaceRoot: URI): Promise<{ files: number; chunks: number; vectors: number; bytes: number; mode?: 'lexical' | 'hybrid' } | undefined>;
}
