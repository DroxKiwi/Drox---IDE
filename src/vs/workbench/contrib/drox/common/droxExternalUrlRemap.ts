/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// allow-any-unicode-comment-file
import { IProductService } from '../../../../platform/product/common/productService.js';
import { isDroxMicrosoftAgentsSurfaceEnabled } from './droxMicrosoftAgentsSurface.js';
import { DROX_PRODUCT_NOTICE_URL } from './droxProductUrls.js';
const DROX_ALLOWED_HOST_SNIPPETS = [
	'github.com/droxkiwi',
	'localhost',
	'127.0.0.1',
	'[::1]',
	'nodejs.org',
] as const;
const DROX_REMAP_HOST_SNIPPETS = [
	'aka.ms/',
	'code.visualstudio.com/',
	'vscode.com/docs',
	'visualstudio.com/',
	'api.github.com/copilot',
	'copilot_internal',
	'login.microsoftonline.com',
	'login.live.com',
	'github.com/features/copilot',
	'docs.github.com/en/copilot',
	'docs.github.com/copilot',
	'microsoft.com/en-us/microsoft-copilot',
] as const;
export function shouldRemapDroxOutboundUrls(productService: IProductService): boolean {
	return !isDroxMicrosoftAgentsSurfaceEnabled(productService);
}
function normalizeUrlForMatch(url: string): string {
	return url.trim().toLowerCase();
}
function isDroxAllowedOutboundUrl(normalized: string): boolean {
	if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
		return true;
	}
	return DROX_ALLOWED_HOST_SNIPPETS.some(snippet => normalized.includes(snippet));
}
function shouldRemapOutboundUrl(normalized: string): boolean {
	if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
		return false;
	}
	return DROX_REMAP_HOST_SNIPPETS.some(snippet => normalized.includes(snippet));
}
/**
 * Remplace les URLs Microsoft / Copilot / auth cloud par la NOTICE Drox.
 * Les liens Drox, localhost et outils dev connus passent inchangés.
 */
export function remapDroxOutboundUrl(
	url: string,
	productService: Pick<IProductService, 'droxMicrosoftAgentsSurfaceEnabled'>,
): string {
	if (!shouldRemapDroxOutboundUrls(productService as IProductService)) {
		return url;
	}
	const normalized = normalizeUrlForMatch(url);
	if (isDroxAllowedOutboundUrl(normalized)) {
		return url;
	}
	if (shouldRemapOutboundUrl(normalized)) {
		return DROX_PRODUCT_NOTICE_URL;
	}
	return url;
}
