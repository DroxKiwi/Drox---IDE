/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Run rail station wire ids (engine ASCII tokens). */
export type DroxRailStationId =
	| 'intent'
	| 'read'
	| 'propose'
	| 'plan'
	| 'act'
	| 'verify'
	| 'answer';

export type DroxRailStationStatus = 'running' | 'done' | 'waiting_user' | 'blocked';

/** `AgentEvent` rail station enter (1.4.0). */
export interface IDroxRailStationEnterEvent {
	readonly kind: 'rail_station_enter';
	readonly station: DroxRailStationId;
	readonly label?: string;
	readonly task_id?: string;
}

export interface IDroxRailStationHoldEvent {
	readonly kind: 'rail_station_hold';
	readonly station: DroxRailStationId;
}

export interface IDroxRailStationDoneEvent {
	readonly kind: 'rail_station_done';
	readonly station: DroxRailStationId;
}

export interface IDroxRailSegmentStartEvent {
	readonly kind: 'rail_segment_start';
	readonly station: string;
	readonly task_id: string;
	readonly label?: string;
	readonly scope: readonly string[];
}

export interface IDroxRailSegmentDoneEvent {
	readonly kind: 'rail_segment_done';
	readonly task_id: string;
	readonly status: string;
	readonly summary?: string;
	readonly paths_touched: readonly string[];
}
