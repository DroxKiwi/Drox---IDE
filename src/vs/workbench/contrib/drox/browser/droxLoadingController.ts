/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DROX_LOADING_SHOW_DELAY_MS } from './droxLoadingConstants.js';

export interface IDroxDelayedLoadingCallbacks {
	readonly onShow: () => void;
	readonly onHide: () => void;
}

/** Compteur partagé pour joindre plusieurs chargements concurrents sur un même overlay. */
export class DroxLoadingGate {

	private _active = 0;
	private _shown = false;
	private _timer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly callbacks: IDroxDelayedLoadingCallbacks,
		private readonly delayMs: number = DROX_LOADING_SHOW_DELAY_MS,
	) { }

	showWhile<T>(promise: Promise<T>): Promise<T> {
		this._begin();
		return promise.finally(() => this._end());
	}

	private _begin(): void {
		this._active++;
		if (this._active === 1 && !this._shown && this._timer === undefined) {
			this._timer = setTimeout(() => {
				this._timer = undefined;
				if (this._active > 0 && !this._shown) {
					this._shown = true;
					this.callbacks.onShow();
				}
			}, this.delayMs);
		}
	}

	private _end(): void {
		this._active = Math.max(0, this._active - 1);
		if (this._active === 0) {
			if (this._timer !== undefined) {
				clearTimeout(this._timer);
				this._timer = undefined;
			}
			if (this._shown) {
				this._shown = false;
				this.callbacks.onHide();
			}
		}
	}
}
