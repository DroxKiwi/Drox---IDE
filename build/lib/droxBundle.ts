/*---------------------------------------------------------------------------------------------
 *  Copyright (c) KDDS. Drox IDE fork — packaging helpers (Copilot built-in extension).
 *--------------------------------------------------------------------------------------------*/

import product from '../../product.json' with { type: 'json' };

/**
 * When `product.json` → `droxMicrosoftAgentsSurfaceEnabled` is not `true`, Drox ships
 * without the built-in `extensions/copilot` tree (runtime uses `droxSessionsProvider`).
 */
export function shouldBundleDroxCopilotExtension(): boolean {
	return product.droxMicrosoftAgentsSurfaceEnabled === true;
}

/** Globs to negate `.build/extensions/copilot` in desktop packaging streams. */
export function getDroxCopilotExtensionPackagingExclusions(): string[] {
	if (shouldBundleDroxCopilotExtension()) {
		return [];
	}
	return [
		'!.build/extensions/copilot',
		'!.build/extensions/copilot/**',
	];
}
