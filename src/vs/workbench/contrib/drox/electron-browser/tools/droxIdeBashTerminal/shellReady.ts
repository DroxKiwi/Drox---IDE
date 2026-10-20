/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../../base/common/async.js';
import { TerminalCapability } from '../../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import { collectRecentBuffer } from './buffer.js';

/**
 * Wait until a fresh agent shell has settled (lot ready).
 *
 * Dogfood: first bash after create/recycle returned Windows banner as « stdout »
 * because `bufferBefore` was taken before the banner landed, then delta = chrome.
 *
 * Revert: make this a no-op `return` — runner still works, chrome strip remains.
 */
const SHELL_READY_BUDGET_MS = 2_500;
const SHELL_READY_POLL_MS = 50;
/** Min time with a visible prompt before we accept SI-less shells. */
const SHELL_READY_PROMPT_MIN_MS = 400;

export async function waitForDroxAgentShellReady(instance: ITerminalInstance): Promise<void> {
	const started = Date.now();
	let sawPromptChrome = false;

	while (Date.now() - started < SHELL_READY_BUDGET_MS) {
		if (instance.isDisposed) {
			return;
		}
		const detection = instance.capabilities.get(TerminalCapability.CommandDetection);
		const buf = collectRecentBuffer(instance);
		const trimmed = buf.trimEnd();
		if (/[A-Za-z]:\\[^>\r\n]*>\s*$/.test(trimmed) || /\$\s*$/.test(trimmed)) {
			sawPromptChrome = true;
		}
		// Prefer CommandDetection present + prompt visible (banner already in buffer).
		if (detection && sawPromptChrome) {
			return;
		}
		// Fallback: prompt alone after a short settle (SI slow / missing).
		if (sawPromptChrome && Date.now() - started >= SHELL_READY_PROMPT_MIN_MS) {
			return;
		}
		await timeout(SHELL_READY_POLL_MS);
	}
}
