/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Poll interval for persistent-session resource metrics (ms). */
export const DROX_RESOURCE_METRICS_POLL_MS = 5_000;

/** Samples kept per metric ≈ 1 hour at {@link DROX_RESOURCE_METRICS_POLL_MS}. */
export const DROX_RESOURCE_METRICS_HISTORY_CAPACITY = 720;

/** Soft cap used to turn estimated session disk usage into a percentage. */
export const DROX_RESOURCE_DISK_SOFT_CAP_BYTES = 512 * 1024 * 1024;

/**
 * Soft bandwidth cap (bytes/sec) used to turn estimated down/up rates into a percentage.
 * ~2 MB/s ≈ 100% — enough headroom for LLM streams and git without pegging idle sessions.
 */
export const DROX_RESOURCE_NETWORK_SOFT_CAP_BYTES_PER_SEC = 2 * 1024 * 1024;

export interface IDroxSessionResourceSample {
	readonly cpuPercent: number;
	readonly ramPercent: number;
	readonly diskPercent: number;
	readonly downloadPercent: number;
	readonly uploadPercent: number;
	readonly at: number;
}

/**
 * Fixed-capacity ring buffer for one session's resource history (window lifetime).
 */
export class DroxSessionResourceMetricsRing {

	private readonly _cpu: Float32Array;
	private readonly _ram: Float32Array;
	private readonly _disk: Float32Array;
	private readonly _down: Float32Array;
	private readonly _up: Float32Array;
	private readonly _at: Float64Array;
	private _count = 0;
	private _next = 0;

	constructor(
		readonly capacity: number = DROX_RESOURCE_METRICS_HISTORY_CAPACITY,
	) {
		this._cpu = new Float32Array(capacity);
		this._ram = new Float32Array(capacity);
		this._disk = new Float32Array(capacity);
		this._down = new Float32Array(capacity);
		this._up = new Float32Array(capacity);
		this._at = new Float64Array(capacity);
	}

	get length(): number {
		return this._count;
	}

	push(sample: IDroxSessionResourceSample): void {
		this._cpu[this._next] = sample.cpuPercent;
		this._ram[this._next] = sample.ramPercent;
		this._disk[this._next] = sample.diskPercent;
		this._down[this._next] = sample.downloadPercent;
		this._up[this._next] = sample.uploadPercent;
		this._at[this._next] = sample.at;
		this._next = (this._next + 1) % this.capacity;
		if (this._count < this.capacity) {
			this._count++;
		}
	}

	latest(): IDroxSessionResourceSample | undefined {
		if (this._count === 0) {
			return undefined;
		}
		const idx = (this._next - 1 + this.capacity) % this.capacity;
		return {
			cpuPercent: this._cpu[idx],
			ramPercent: this._ram[idx],
			diskPercent: this._disk[idx],
			downloadPercent: this._down[idx],
			uploadPercent: this._up[idx],
			at: this._at[idx],
		};
	}

	/** Chronological series (oldest → newest) for sparkline rendering. */
	series(kind: 'cpu' | 'ram' | 'disk' | 'download' | 'upload'): number[] {
		const out: number[] = [];
		const src = kind === 'cpu' ? this._cpu
			: kind === 'ram' ? this._ram
				: kind === 'disk' ? this._disk
					: kind === 'download' ? this._down
						: this._up;
		const start = this._count < this.capacity ? 0 : this._next;
		for (let i = 0; i < this._count; i++) {
			out.push(src[(start + i) % this.capacity]);
		}
		return out;
	}
}

export function clampPercent(value: number): number {
	if (!Number.isFinite(value) || value < 0) {
		return 0;
	}
	if (value > 100) {
		return 100;
	}
	return value;
}

export function formatResourcePercent(value: number): string {
	const rounded = Math.round(clampPercent(value));
	return `${rounded}%`;
}

/** Activity weight used to attribute shared process/OS load to a session. */
export function sessionResourceActivityWeight(signals: {
	readonly modelActive: boolean;
	readonly shellActive: boolean;
	readonly gitOperationActive: boolean;
	readonly isForeground: boolean;
}): number {
	let w = 0.15;
	if (signals.isForeground) {
		w += 0.35;
	}
	if (signals.modelActive) {
		w += 1.2;
	}
	if (signals.shellActive) {
		w += 0.7;
	}
	if (signals.gitOperationActive) {
		w += 0.4;
	}
	return w;
}

export function attributeSharedLoad(systemPercent: number, weight: number, totalWeight: number): number {
	if (totalWeight <= 0) {
		return 0;
	}
	return clampPercent(systemPercent * (weight / totalWeight));
}

export function diskBytesToPercent(bytes: number, softCap: number = DROX_RESOURCE_DISK_SOFT_CAP_BYTES): number {
	return clampPercent((bytes / softCap) * 100);
}

/**
 * Lightweight disk proxy: changed files + optional `.drox` presence bump.
 * Avoids recursive filesystem walks on the UI thread.
 */
export function estimateSessionDiskBytes(changeFileCount: number, hasDroxCacheDir: boolean): number {
	const perFile = 48 * 1024;
	const base = hasDroxCacheDir ? 8 * 1024 * 1024 : 256 * 1024;
	return base + changeFileCount * perFile;
}

/**
 * Per-session network rate proxy (no OS counters available in the renderer).
 * Rates are smoothed so sparklines decay when the session goes idle.
 */
export class DroxSessionNetworkEstimator {

	private _downEma = 0;
	private _upEma = 0;

	tick(signals: {
		readonly modelActive: boolean;
		readonly shellActive: boolean;
		readonly gitOperationActive: boolean;
		readonly isForeground: boolean;
	}, dtSeconds: number = DROX_RESOURCE_METRICS_POLL_MS / 1000): { downloadPercent: number; uploadPercent: number } {
		const dt = Math.max(0.5, dtSeconds);

		// Instantaneous bytes/sec estimates from known session activity.
		let downBps = 0;
		let upBps = 0;
		if (signals.modelActive) {
			// LLM token/stream ingress + light egress (tool results / heartbeats).
			downBps += 120_000;
			upBps += 24_000;
		}
		if (signals.gitOperationActive) {
			downBps += 400_000;
			upBps += 350_000;
		}
		if (signals.shellActive) {
			downBps += 40_000;
			upBps += 20_000;
		}
		if (signals.isForeground && !signals.modelActive && !signals.shellActive && !signals.gitOperationActive) {
			// Quiet foreground chat still has occasional UI / sync chatter.
			downBps += 4_000;
			upBps += 2_000;
		}

		const alpha = 1 - Math.exp(-dt / 8); // ~8s smoothing horizon
		this._downEma = this._downEma + alpha * (downBps - this._downEma);
		this._upEma = this._upEma + alpha * (upBps - this._upEma);

		return {
			downloadPercent: clampPercent((this._downEma / DROX_RESOURCE_NETWORK_SOFT_CAP_BYTES_PER_SEC) * 100),
			uploadPercent: clampPercent((this._upEma / DROX_RESOURCE_NETWORK_SOFT_CAP_BYTES_PER_SEC) * 100),
		};
	}

	reset(): void {
		this._downEma = 0;
		this._upEma = 0;
	}
}

/** Draw a compact sparkline into a canvas (mutates canvas size). */
export function paintResourceSparkline(
	canvas: HTMLCanvasElement,
	values: readonly number[],
	color: string,
): void {
	const width = 200;
	const height = 52;
	const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
	canvas.width = Math.floor(width * dpr);
	canvas.height = Math.floor(height * dpr);
	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;

	const ctx = canvas.getContext('2d');
	if (!ctx) {
		return;
	}
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	ctx.clearRect(0, 0, width, height);

	// Baseline grid
	ctx.strokeStyle = 'rgba(127,127,127,0.25)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(0, height - 0.5);
	ctx.lineTo(width, height - 0.5);
	ctx.moveTo(0, height / 2);
	ctx.lineTo(width, height / 2);
	ctx.stroke();

	if (values.length < 2) {
		ctx.fillStyle = color;
		ctx.font = '11px sans-serif';
		ctx.fillText('…', 8, height / 2 + 4);
		return;
	}

	const pad = 2;
	const usableW = width - pad * 2;
	const usableH = height - pad * 2;
	ctx.beginPath();
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.5;
	ctx.lineJoin = 'round';
	for (let i = 0; i < values.length; i++) {
		const x = pad + (i / (values.length - 1)) * usableW;
		const y = pad + usableH * (1 - Math.min(1, Math.max(0, values[i] / 100)));
		if (i === 0) {
			ctx.moveTo(x, y);
		} else {
			ctx.lineTo(x, y);
		}
	}
	ctx.stroke();
}
