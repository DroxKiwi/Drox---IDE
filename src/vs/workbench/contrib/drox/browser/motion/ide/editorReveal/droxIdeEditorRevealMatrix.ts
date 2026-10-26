/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Matrix rain: binary only. */
const DIGITS = '01';

/** Smaller than the compile-sweep glyph grid — discrete rain. */
export const DROX_IDE_MATRIX_CELL_PX = 7;

interface MatrixColumn {
	col: number;
	headY: number;
	speedPxPerMs: number;
	trailLen: number;
	digits: string[];
}

export interface DroxIdeEditorRevealMatrixRain {
	columns: MatrixColumn[];
	rows: number;
	cellPx: number;
}

export function createDroxIdeEditorRevealMatrixRain(
	widthPx: number,
	heightPx: number,
	durationMs: number,
): DroxIdeEditorRevealMatrixRain {
	const cellPx = DROX_IDE_MATRIX_CELL_PX;
	const cols = Math.ceil(widthPx / cellPx);
	const rows = Math.ceil(heightPx / cellPx);
	const columnCount = Math.max(8, Math.min(cols, Math.floor(cols * 0.18)));
	const used = new Set<number>();
	const columns: MatrixColumn[] = [];

	for (let i = 0; i < columnCount; i++) {
		let col = (Math.random() * cols) | 0;
		let guard = 0;
		while (used.has(col) && guard++ < 12) {
			col = (col + 1) % cols;
		}
		used.add(col);

		const trailLen = 4 + ((Math.random() * 5) | 0);
		const digits: string[] = [];
		for (let j = 0; j < trailLen; j++) {
			digits.push(DIGITS[(Math.random() * DIGITS.length) | 0]!);
		}

		const speedPxPerMs = (heightPx * 1.15) / durationMs;
		const headY = -cellPx * (2 + ((Math.random() * trailLen) | 0));

		columns.push({
			col,
			headY,
			speedPxPerMs,
			trailLen,
			digits,
		});
	}

	return { columns, rows, cellPx };
}

export function drawDroxIdeEditorRevealMatrixRain(
	ctx: CanvasRenderingContext2D,
	rain: DroxIdeEditorRevealMatrixRain,
	elapsedMs: number,
	globalT: number,
	font: string,
): void {
	const fadeOut = 1 - globalT * 0.92;
	if (fadeOut <= 0.02) {
		return;
	}

	ctx.font = font;
	ctx.textBaseline = 'top';

	for (const column of rain.columns) {
		const headY = column.headY + column.speedPxPerMs * elapsedMs;
		const headRow = Math.floor(headY / rain.cellPx);

		for (let i = 0; i < column.trailLen; i++) {
			const row = headRow - i;
			if (row < 0 || row >= rain.rows) {
				continue;
			}
			const trail = 1 - i / column.trailLen;
			const isHead = i === 0;
			const alpha = (isHead ? 0.32 : 0.06 + trail * 0.12) * fadeOut;
			if (alpha < 0.04) {
				continue;
			}
			ctx.fillStyle = isHead
				? `rgba(204, 204, 204, ${alpha})`
				: `rgba(136, 136, 136, ${alpha})`;
			ctx.fillText(
				column.digits[i]!,
				column.col * rain.cellPx,
				row * rain.cellPx,
			);
		}
	}
}
