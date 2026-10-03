/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

export type DroxTrafficDirection = 'out' | 'in';

export type DroxTrafficKind = 'llm' | 'embed' | 'mcp' | 'tool' | 'rpc' | 'other';

export type DroxTrafficMode = 'live' | 'persisted';

/** User rule: match destination (URL host / IP) → colored bank-style tag. */
export interface IDroxTrafficDestinationTag {
	readonly id: string;
	readonly label: string;
	/** CSS color, e.g. `#2E7D32`. */
	readonly color: string;
	/** Substring matched against host / IP / URL (case-insensitive). */
	readonly match: string;
}

/** Simple alert: fire a notification when traffic hits a matching destination. */
export interface IDroxTrafficDestinationAlert {
	readonly id: string;
	/** Substring matched against host / IP / URL (case-insensitive). */
	readonly match: string;
	/** Optional short label shown in the toast. */
	readonly label?: string;
}

/** Events shown per ledger page (most recent first). */
export const DROX_TRAFFIC_PAGE_SIZE = 1000;

/** Soft in-memory cap (older events drop off; persisted mode still appends to disk). */
export const DROX_TRAFFIC_LIVE_CAP = 10_000;

export interface IDroxTrafficEvent {
	readonly id: string;
	readonly at: number;
	readonly direction: DroxTrafficDirection;
	readonly kind: DroxTrafficKind;
	readonly summary: string;
	readonly detail?: string;
	readonly durationMs?: number;
	readonly status?: 'ok' | 'error' | 'running';
	/** Host, IP or URL fragment used for destination tagging. */
	readonly destination?: string;
	readonly tag?: IDroxTrafficDestinationTag;
}
