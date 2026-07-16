/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/droxLoadingKit.css';
import * as dom from '../../../../base/browser/dom.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { appendDroxActivityGrid } from './droxActivityGrid.js';
import { DROX_LOADING_SHOW_DELAY_MS } from './droxLoadingConstants.js';
import { DroxLoadingGate } from './droxLoadingController.js';
import { createDroxChatSessionSkeletonElement } from './droxLoadingSkeleton.js';

export interface IDroxSessionLoadingOverlayOptions {
	readonly showSkeleton?: boolean;
	readonly label?: string;
	readonly delayMs?: number;
}

/**
 * Overlay Drox (grille 3×3 + skeleton optionnel) sur un leaf chat pendant
 * `acquireOrLoadSession` ou équivalent.
 */
export class DroxSessionLoadingOverlay extends Disposable {

	private readonly _overlay: HTMLElement;
	private readonly _status: HTMLElement;
	private readonly _gate: DroxLoadingGate;

	constructor(
		host: HTMLElement,
		options: IDroxSessionLoadingOverlayOptions = {},
	) {
		super();
		host.classList.add('drox-loading-host');

		this._overlay = dom.append(host, dom.$('.drox-loading-overlay'));
		this._overlay.setAttribute('aria-hidden', 'true');

		const inner = dom.append(this._overlay, dom.$('.drox-loading-overlay-inner'));
		appendDroxActivityGrid(inner, 'activity-grid activity-grid-inline drox-loading-grid');
		this._status = dom.append(inner, dom.$('.drox-loading-label'));
		this._status.textContent = options.label ?? localize('drox.loading.session', 'Loading session…');

		if (options.showSkeleton !== false) {
			inner.appendChild(createDroxChatSessionSkeletonElement());
		}

		this._gate = new DroxLoadingGate({
			onShow: () => {
				this._overlay.classList.add('visible');
				this._overlay.setAttribute('aria-hidden', 'false');
				this._overlay.setAttribute('role', 'status');
			},
			onHide: () => {
				this._overlay.classList.remove('visible');
				this._overlay.setAttribute('aria-hidden', 'true');
				this._overlay.removeAttribute('role');
			},
		}, options.delayMs ?? DROX_LOADING_SHOW_DELAY_MS);

		this._register({ dispose: () => this._overlay.remove() });
	}

	showWhile<T>(promise: Promise<T>): Promise<T> {
		return this._gate.showWhile(promise);
	}
}
