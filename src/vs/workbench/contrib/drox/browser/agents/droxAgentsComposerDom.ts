/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { mainWindow } from '../../../../../base/browser/window.js';
import { createTrustedTypesPolicy } from '../../../../../base/browser/trustedTypes.js';

const ttPolicy = createTrustedTypesPolicy('droxAgentsComposerInnerHtml', {
	createHTML: value => value,
	createScriptURL: value => value,
});

interface IDroxChatFn {
	setInnerHtml?: (el: HTMLElement | null | undefined, html: string) => void;
	clearInnerHtml?: (el: HTMLElement | null | undefined) => void;
}

export function setDroxAgentsComposerInnerHtml(element: HTMLElement, html: string): void {
	if (ttPolicy) {
		const template = mainWindow.document.createElement('template');
		template.innerHTML = ttPolicy.createHTML(html) as unknown as string;
		element.replaceChildren(...Array.from(template.content.childNodes));
		return;
	}
	// Fallback (ex. avant enregistrement CSP) — template évite innerHTML direct sur le mount.
	const template = mainWindow.document.createElement('template');
	template.innerHTML = html;
	element.replaceChildren(...Array.from(template.content.childNodes));
}

export function toDroxAgentsComposerTrustedScriptUrl(url: string): string {
	if (ttPolicy?.createScriptURL) {
		return ttPolicy.createScriptURL(url) as unknown as string;
	}
	return url;
}

/** Remplace les helpers DOM du webview pour respecter Trusted Types (fenêtre Agents). */
export function installDroxChatTrustedDomOverrides(): void {
	const D = (globalThis as { DroxChat?: { fn: IDroxChatFn } }).DroxChat;
	if (!D?.fn) {
		return;
	}
	D.fn.setInnerHtml = (el, html) => {
		if (!el) {
			return;
		}
		setDroxAgentsComposerInnerHtml(el, html);
	};
	D.fn.clearInnerHtml = (el) => {
		el?.replaceChildren();
	};
}
