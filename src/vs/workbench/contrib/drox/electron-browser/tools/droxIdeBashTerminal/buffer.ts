/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';

/** Recent xterm scrollback (newest→oldest reversed). Lot capture — IDE only. */
export function collectRecentBuffer(instance: ITerminalInstance): string {
	const xterm = instance.xterm;
	if (!xterm) {
		return '';
	}
	const lines: string[] = [];
	let n = 0;
	for (const line of xterm.getBufferReverseIterator()) {
		lines.push(line);
		if (++n >= 200) {
			break;
		}
	}
	return lines.reverse().join('\n');
}
