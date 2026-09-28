/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Gate so `canResolveChatSession('drox')` waits for the real content-provider
 * registration, not only the config flag (which caused Agent→IDE timeouts).
 */

let ready = false;
const waiters: Array<() => void> = [];

/** Call after `registerChatSessionContentProvider(DROX_CHAT_SESSION_TYPE, …)`. */
export function markDroxChatContentProviderReady(): void {
	if (ready) {
		return;
	}
	ready = true;
	for (const resolve of waiters.splice(0)) {
		resolve();
	}
}

export function isDroxChatContentProviderReady(): boolean {
	return ready;
}

/** Resolves true when the provider is registered, false on timeout. */
export function whenDroxChatContentProviderReady(timeoutMs = 8_000): Promise<boolean> {
	if (ready) {
		return Promise.resolve(true);
	}
	return new Promise<boolean>(resolve => {
		const timer = setTimeout(() => {
			const idx = waiters.indexOf(onReady);
			if (idx >= 0) {
				waiters.splice(idx, 1);
			}
			resolve(false);
		}, timeoutMs);
		const onReady = () => {
			clearTimeout(timer);
			resolve(true);
		};
		waiters.push(onReady);
	});
}

/** Test-only reset. */
export function resetDroxChatContentProviderReadyForTests(): void {
	ready = false;
	waiters.length = 0;
}
