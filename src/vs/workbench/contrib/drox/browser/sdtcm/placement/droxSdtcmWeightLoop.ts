/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';

/** Keeps asking until the weight pose has finished pulling the folders back. */
export function trackDroxSdtcmWeightMotion(store: DisposableStore, tick: () => void): void {
	let handle = 0;
	const frame = () => {
		handle = requestAnimationFrame(frame);
		tick();
	};
	handle = requestAnimationFrame(frame);
	store.add(toDisposable(() => cancelAnimationFrame(handle)));
}
