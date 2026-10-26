/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { mainWindow } from '../../../../../../../base/browser/window.js';
import { Disposable, IDisposable } from '../../../../../../../base/common/lifecycle.js';
import './droxIdeEditorReveal.css';
import {
	createDroxIdeEditorRevealMatrixRain,
	drawDroxIdeEditorRevealMatrixRain,
	DROX_IDE_MATRIX_CELL_PX,
} from './droxIdeEditorRevealMatrix.js';

const CHARSET = '{}[]();=<>/\\|&*#@$01';
const DURATION_MS = 300;
const CELL_PX = 14;
const RESOLUTION = 0.4;

interface GlyphCell {
	char: string;
	phase: number;
}

/**
 * Low-res glyph field that "locks in" behind a fast scan line — code compile metaphor.
 * Canvas is scaled up; one rAF loop; no DOM layout thrash.
 */
export function playDroxIdeEditorReveal(editorHost: HTMLElement): IDisposable {
	if (mainWindow.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		return Disposable.None;
	}

	const rect = editorHost.getBoundingClientRect();
	if (rect.width < 48 || rect.height < 48) {
		return Disposable.None;
	}

	const overlay = document.createElement('div');
	overlay.className = 'drox-ide-editor-reveal';
	const canvas = document.createElement('canvas');
	canvas.className = 'drox-ide-editor-reveal__canvas';
	overlay.appendChild(canvas);

	const sheen = document.createElement('div');
	sheen.className = 'drox-ide-editor-reveal__sheen';
	overlay.appendChild(sheen);

	const previousPosition = editorHost.style.position;
	if (!previousPosition || previousPosition === 'static') {
		editorHost.style.position = 'relative';
	}
	editorHost.appendChild(overlay);

	const dpr = Math.min(mainWindow.devicePixelRatio || 1, 2);
	const w = Math.max(1, Math.floor(rect.width * RESOLUTION));
	const h = Math.max(1, Math.floor(rect.height * RESOLUTION));
	canvas.width = Math.floor(w * dpr);
	canvas.height = Math.floor(h * dpr);
	canvas.style.width = `${rect.width}px`;
	canvas.style.height = `${rect.height}px`;

	const ctx = canvas.getContext('2d', { alpha: true });
	if (!ctx) {
		overlay.remove();
		return Disposable.None;
	}
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

	const cols = Math.ceil(w / CELL_PX);
	const rows = Math.ceil(h / CELL_PX);
	const cells: GlyphCell[] = [];
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			cells.push({
				char: CHARSET[(Math.random() * CHARSET.length) | 0]!,
				phase: Math.random(),
			});
		}
	}

	const font = `${CELL_PX}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
	const matrixRain = createDroxIdeEditorRevealMatrixRain(w, h, DURATION_MS);
	const matrixFont = `${DROX_IDE_MATRIX_CELL_PX}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
	let raf = 0;
	let cancelled = false;
	const start = performance.now();

	const cleanup = () => {
		cancelled = true;
		if (raf) {
			mainWindow.cancelAnimationFrame(raf);
		}
		overlay.remove();
		if (!previousPosition || previousPosition === 'static') {
			editorHost.style.position = previousPosition;
		}
	};

	const tick = (now: number) => {
		if (cancelled) {
			return;
		}
		const elapsedMs = now - start;
		const t = Math.min(1, elapsedMs / DURATION_MS);
		const sweep = t * 1.08 - 0.04;
		ctx.clearRect(0, 0, w, h);

		drawDroxIdeEditorRevealMatrixRain(ctx, matrixRain, elapsedMs, t, matrixFont);

		ctx.font = font;
		ctx.textBaseline = 'top';

		for (let r = 0; r < rows; r++) {
			const rowY = r / rows;
			const rowDist = sweep - rowY;
			for (let c = 0; c < cols; c++) {
				const cell = cells[r * cols + c]!;
				let alpha = 0.55;
				if (rowDist > 0.12) {
					alpha = Math.max(0, 0.5 - rowDist * 2.8);
				} else if (rowDist > -0.04) {
					alpha = 0.85 + cell.phase * 0.15;
				} else {
					alpha = 0.22 + cell.phase * 0.2;
				}
				if (alpha < 0.03) {
					continue;
				}
				ctx.fillStyle = `rgba(136, 136, 136, ${alpha * (1 - t * 0.85)})`;
				ctx.fillText(cell.char, c * CELL_PX, r * CELL_PX);
			}
		}

		sheen.style.transform = `translateY(calc(${Math.min(100, sweep * 100)}% - 50%))`;

		if (t < 1) {
			raf = mainWindow.requestAnimationFrame(tick);
		} else {
			overlay.classList.add('drox-ide-editor-reveal--done');
			mainWindow.setTimeout(cleanup, 80);
		}
	};

	raf = mainWindow.requestAnimationFrame(tick);

	return { dispose: cleanup };
}
