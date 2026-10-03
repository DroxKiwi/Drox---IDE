/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { IDroxTrafficDestinationAlert, IDroxTrafficDestinationTag } from './droxTrafficTypes.js';

/** Palette style banque — labels courts pour le sélecteur UI. */
export const DROX_TRAFFIC_TAG_PALETTE: readonly { readonly color: string; readonly label: string }[] = [
	{ color: '#2E7D32', label: 'Vert' },
	{ color: '#1565C0', label: 'Bleu' },
	{ color: '#EF6C00', label: 'Orange' },
	{ color: '#6A1B9A', label: 'Violet' },
	{ color: '#C62828', label: 'Rouge' },
	{ color: '#00838F', label: 'Sarcelle' },
	{ color: '#F9A825', label: 'Ambre' },
	{ color: '#455A64', label: 'Gris' },
];

/** Host only (lowercase), when `raw` looks like a URL / host:port. */
export function normalizeTrafficDestination(raw: string | undefined): string | undefined {
	if (!raw) {
		return undefined;
	}
	const trimmed = raw.trim();
	if (!trimmed) {
		return undefined;
	}
	try {
		const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
		const u = new URL(withScheme);
		return (u.host || trimmed).toLowerCase();
	} catch {
		return trimmed.toLowerCase();
	}
}

export function destinationFromUrl(url: string): string | undefined {
	const trimmed = url.trim();
	if (!trimmed) {
		return undefined;
	}
	// Keep host + path (+ query) so tags can match fragments like `ollama.com` or `/api/tags`.
	try {
		const u = new URL(trimmed);
		const path = u.pathname === '/' ? '' : u.pathname;
		return `${u.host}${path}${u.search}`.toLowerCase();
	} catch {
		return normalizeTrafficDestination(trimmed);
	}
}

/**
 * Needle for partial match: lowercase, strip scheme, trim trailing slash.
 * Does **not** URL-parse bare fragments (so `api/tags` stays intact).
 */
export function normalizeTrafficMatchNeedle(raw: string | undefined): string {
	let s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
	if (!s) {
		return '';
	}
	s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
	if (s.length > 1 && s.endsWith('/')) {
		s = s.slice(0, -1);
	}
	return s;
}

/**
 * Haystack used for destination matching: destination, derived host, summary.
 * Newlines keep segments distinct so accidental cross-joins are unlikely.
 */
export function buildTrafficMatchHaystack(
	destination: string | undefined,
	summary?: string,
): string {
	const chunks: string[] = [];
	const push = (value: string | undefined): void => {
		const t = typeof value === 'string' ? value.trim().toLowerCase() : '';
		if (t && !chunks.includes(t)) {
			chunks.push(t);
		}
	};
	push(destination);
	push(normalizeTrafficDestination(destination));
	if (destination) {
		try {
			const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(destination)
				? destination
				: `http://${destination}`;
			const u = new URL(withScheme);
			const path = u.pathname === '/' ? '' : u.pathname;
			push(`${u.host}${path}${u.search}`);
		} catch {
			// ignore
		}
	}
	push(summary);
	return chunks.join('\n');
}

/**
 * First matching tag whose `match` is a case-insensitive substring of the
 * destination / summary haystack. Longer matches win.
 */
export function matchTrafficDestinationTag(
	destination: string | undefined,
	tags: readonly IDroxTrafficDestinationTag[],
	summary?: string,
): IDroxTrafficDestinationTag | undefined {
	if (!tags.length) {
		return undefined;
	}
	const haystack = buildTrafficMatchHaystack(destination, summary);
	if (!haystack) {
		return undefined;
	}
	let best: IDroxTrafficDestinationTag | undefined;
	let bestLen = -1;
	for (const tag of tags) {
		const needle = normalizeTrafficMatchNeedle(tag.match);
		if (!needle) {
			continue;
		}
		if (haystack.includes(needle) && needle.length > bestLen) {
			best = tag;
			bestLen = needle.length;
		}
	}
	return best;
}

export function parseTrafficDestinationTags(raw: unknown): IDroxTrafficDestinationTag[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const out: IDroxTrafficDestinationTag[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') {
			continue;
		}
		const o = item as Record<string, unknown>;
		const id = typeof o.id === 'string' ? o.id.trim() : '';
		const label = typeof o.label === 'string' ? o.label.trim() : '';
		const color = typeof o.color === 'string' ? o.color.trim() : '';
		const match = typeof o.match === 'string' ? o.match.trim() : '';
		if (!id || !label || !color || !match) {
			continue;
		}
		out.push({ id, label, color, match });
	}
	return out;
}

export function newTrafficTagId(): string {
	return `tag-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newTrafficAlertId(): string {
	return `alert-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * All alert rules whose `match` is a case-insensitive substring of the destination / summary.
 */
export function matchTrafficDestinationAlerts(
	destination: string | undefined,
	alerts: readonly IDroxTrafficDestinationAlert[],
	summary?: string,
): IDroxTrafficDestinationAlert[] {
	if (!alerts.length) {
		return [];
	}
	const haystack = buildTrafficMatchHaystack(destination, summary);
	if (!haystack) {
		return [];
	}
	const hit: IDroxTrafficDestinationAlert[] = [];
	for (const alert of alerts) {
		const needle = normalizeTrafficMatchNeedle(alert.match);
		if (needle && haystack.includes(needle)) {
			hit.push(alert);
		}
	}
	return hit;
}

export function parseTrafficDestinationAlerts(raw: unknown): IDroxTrafficDestinationAlert[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const out: IDroxTrafficDestinationAlert[] = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') {
			continue;
		}
		const o = item as Record<string, unknown>;
		const id = typeof o.id === 'string' ? o.id.trim() : '';
		const match = typeof o.match === 'string' ? o.match.trim() : '';
		const label = typeof o.label === 'string' ? o.label.trim() : undefined;
		if (!id || !match) {
			continue;
		}
		out.push(label ? { id, match, label } : { id, match });
	}
	return out;
}
