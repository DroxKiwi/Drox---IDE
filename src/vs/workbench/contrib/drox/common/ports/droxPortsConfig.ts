/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import {
	DroxPortsOnReady,
	DroxPortsProtocol,
	IDroxPortsForward,
	IDroxPortsResolvedLaunch,
	IDroxPortsTool,
} from './droxPortsTypes.js';

const PLACEHOLDER_RE = /\{\{(localHost|localPort|remoteHost|remotePort|label|id)\}\}/g;

export interface IDroxPortsPlaceholderContext {
	readonly localHost: string;
	readonly localPort: number;
	readonly remoteHost: string;
	readonly remotePort: number;
	readonly label: string;
	readonly id: string;
}

export function newDroxPortsToolId(): string {
	return `tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newDroxPortsForwardId(): string {
	return `fwd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function substituteDroxPortsPlaceholders(template: string, ctx: IDroxPortsPlaceholderContext): string {
	return template.replace(PLACEHOLDER_RE, (_m, key: string) => {
		switch (key) {
			case 'localHost': return ctx.localHost;
			case 'localPort': return String(ctx.localPort);
			case 'remoteHost': return ctx.remoteHost;
			case 'remotePort': return String(ctx.remotePort);
			case 'label': return ctx.label;
			case 'id': return ctx.id;
			default: return _m;
		}
	});
}

export function resolveDroxPortsLaunch(
	forward: IDroxPortsForward,
	tool: IDroxPortsTool,
): IDroxPortsResolvedLaunch {
	const ctx: IDroxPortsPlaceholderContext = {
		localHost: forward.localHost,
		localPort: forward.localPort,
		remoteHost: forward.remoteHost,
		remotePort: forward.remotePort,
		label: forward.label,
		id: forward.id,
	};
	const env: Record<string, string> = {};
	if (tool.env) {
		for (const [k, v] of Object.entries(tool.env)) {
			env[k] = substituteDroxPortsPlaceholders(v, ctx);
		}
	}
	return {
		command: substituteDroxPortsPlaceholders(tool.command, ctx),
		args: tool.args.map(a => substituteDroxPortsPlaceholders(a, ctx)),
		env,
		cwd: tool.cwd ? substituteDroxPortsPlaceholders(tool.cwd, ctx) : undefined,
		localHost: forward.localHost,
		localPort: forward.localPort,
	};
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function trimString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function asPort(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535) {
		return value;
	}
	if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
		const n = Number(value.trim());
		if (n > 0 && n <= 65535) {
			return n;
		}
	}
	return undefined;
}

function asProtocol(value: unknown): DroxPortsProtocol {
	return value === 'https' || value === 'tcp' ? value : 'http';
}

function asOnReady(value: unknown): DroxPortsOnReady {
	return value === 'notify' || value === 'preview' || value === 'browser' ? value : 'none';
}

export function parseDroxPortsTools(raw: unknown): IDroxPortsTool[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const out: IDroxPortsTool[] = [];
	for (const item of raw) {
		const o = asRecord(item);
		const id = trimString(o.id);
		const label = trimString(o.label) || id;
		const command = trimString(o.command);
		if (!id || !command) {
			continue;
		}
		const args = Array.isArray(o.args)
			? o.args.filter((a): a is string => typeof a === 'string').map(a => a)
			: [];
		const envRaw = asRecord(o.env);
		const env: Record<string, string> = {};
		for (const [k, v] of Object.entries(envRaw)) {
			if (typeof v === 'string') {
				env[k] = v;
			}
		}
		const cwd = trimString(o.cwd) || undefined;
		out.push({
			id,
			label,
			command,
			args,
			env: Object.keys(env).length ? env : undefined,
			cwd,
		});
	}
	return out;
}

export function parseDroxPortsForwards(raw: unknown): IDroxPortsForward[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const out: IDroxPortsForward[] = [];
	for (const item of raw) {
		const o = asRecord(item);
		const id = trimString(o.id);
		const remoteHost = trimString(o.remoteHost) || '127.0.0.1';
		const remotePort = asPort(o.remotePort);
		if (!id || remotePort === undefined) {
			continue;
		}
		const localHost = trimString(o.localHost) || '127.0.0.1';
		const localPort = asPort(o.localPort) ?? remotePort;
		const label = trimString(o.label) || `${remoteHost}:${remotePort}`;
		const toolId = trimString(o.toolId) || undefined;
		out.push({
			id,
			label,
			remoteHost,
			remotePort,
			localHost,
			localPort,
			protocol: asProtocol(o.protocol),
			onReady: asOnReady(o.onReady),
			toolId,
		});
	}
	return out;
}

export function droxPortsOpenUrl(forward: IDroxPortsForward): string | undefined {
	if (forward.protocol === 'tcp') {
		return undefined;
	}
	return `${forward.protocol}://${forward.localHost}:${forward.localPort}`;
}

export function serializeDroxPortsTool(tool: IDroxPortsTool): Record<string, unknown> {
	const o: Record<string, unknown> = {
		id: tool.id,
		label: tool.label,
		command: tool.command,
		args: [...tool.args],
	};
	if (tool.env && Object.keys(tool.env).length) {
		o.env = { ...tool.env };
	}
	if (tool.cwd) {
		o.cwd = tool.cwd;
	}
	return o;
}

export function serializeDroxPortsForward(forward: IDroxPortsForward): Record<string, unknown> {
	const o: Record<string, unknown> = {
		id: forward.id,
		label: forward.label,
		remoteHost: forward.remoteHost,
		remotePort: forward.remotePort,
		localHost: forward.localHost,
		localPort: forward.localPort,
		protocol: forward.protocol,
		onReady: forward.onReady,
	};
	if (forward.toolId) {
		o.toolId = forward.toolId;
	}
	return o;
}
