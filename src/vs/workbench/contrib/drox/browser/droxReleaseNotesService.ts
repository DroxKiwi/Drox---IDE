/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import './media/droxReleaseNotes.css';
import * as dom from '../../../../base/browser/dom.js';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import {
	buildDroxReleaseNotesContent,
	getDroxReleaseNotesProductVersion,
	markDroxReleaseNotesSeen,
} from '../common/droxReleaseNotes.js';
import { IDroxReleaseNotesService } from '../common/droxReleaseNotesService.js';

export class DroxReleaseNotesService extends Disposable implements IDroxReleaseNotesService {

	declare readonly _serviceBrand: undefined;

	private overlay: HTMLElement | undefined;
	private session: DisposableStore | undefined;
	private pending: DeferredPromise<void> | undefined;

	constructor(
		@ILayoutService private readonly layoutService: ILayoutService,
		@IStorageService private readonly storageService: IStorageService,
		@IProductService private readonly productService: IProductService,
	) {
		super();
	}

	override dispose(): void {
		this.hide(false);
		super.dispose();
	}

	async showReleaseNotes(): Promise<void> {
		const version = getDroxReleaseNotesProductVersion(this.productService);
		const content = buildDroxReleaseNotesContent(version);
		if (!content) {
			return;
		}
		if (this.pending) {
			return this.pending.p;
		}

		const pending = new DeferredPromise<void>();
		this.pending = pending;

		const session = new DisposableStore();
		this.session = session;

		const overlay = this.ensureOverlay();
		this.renderContent(overlay, content);
		overlay.hidden = false;
		overlay.style.display = '';

		const understoodBtn = overlay.querySelector<HTMLButtonElement>('.drox-release-notes-primary');
		understoodBtn?.focus();

		const close = (markSeen: boolean) => {
			if (markSeen) {
				markDroxReleaseNotesSeen(this.storageService, content.version);
			}
			this.hide(true);
		};

		session.add(dom.addDisposableListener(overlay, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Escape') {
				dom.EventHelper.stop(e, true);
				close(false);
			}
		}));

		session.add(dom.addDisposableListener(overlay.querySelector('.drox-release-notes-backdrop') as HTMLElement, dom.EventType.CLICK, () => {
			close(false);
		}));

		if (understoodBtn) {
			session.add(dom.addDisposableListener(understoodBtn, dom.EventType.CLICK, () => close(true)));
		}

		return pending.p;
	}

	private ensureOverlay(): HTMLElement {
		if (this.overlay) {
			return this.overlay;
		}

		const overlay = dom.$('div.drox-release-notes-overlay', {
			role: 'dialog',
			'aria-modal': 'true',
			'aria-labelledby': 'drox-release-notes-title',
			hidden: 'true',
		});
		dom.append(overlay, dom.$('div.drox-release-notes-backdrop'));
		const card = dom.append(overlay, dom.$('div.drox-release-notes-card'));
		dom.append(card, dom.$('header.drox-release-notes-head'));
		dom.append(card, dom.$('div.drox-release-notes-body'));
		dom.append(card, dom.$('footer.drox-release-notes-actions'));

		this.overlay = overlay;
		this.layoutService.mainContainer.appendChild(overlay);
		this._register({ dispose: () => overlay.remove() });

		return overlay;
	}

	private renderContent(overlay: HTMLElement, content: NonNullable<ReturnType<typeof buildDroxReleaseNotesContent>>): void {
		const head = overlay.querySelector('.drox-release-notes-head') as HTMLElement;
		const body = overlay.querySelector('.drox-release-notes-body') as HTMLElement;
		const actions = overlay.querySelector('.drox-release-notes-actions') as HTMLElement;

		dom.clearNode(head);
		dom.clearNode(body);
		dom.clearNode(actions);

		const brand = dom.append(head, dom.$('p.drox-release-notes-brand'));
		dom.append(brand, dom.$('span.drox-release-notes-brand-name', undefined, 'DROX'));
		dom.append(brand, dom.$('span.drox-release-notes-brand-version', undefined, content.version));

		dom.append(head, dom.$('h2#drox-release-notes-title.drox-release-notes-title', undefined, content.title));
		dom.append(head, dom.$('p.drox-release-notes-lead', undefined, content.message));

		const list = dom.append(body, dom.$('ul.drox-release-notes-list'));
		for (const item of content.items) {
			dom.append(list, dom.$('li', undefined, item));
		}

		const understoodBtn = dom.append(
			actions,
			dom.$('button.drox-release-notes-primary', { type: 'button' }, content.understoodLabel),
		);
		understoodBtn.id = 'drox-release-notes-understood';
	}

	private hide(resolvePending: boolean): void {
		if (this.overlay) {
			this.overlay.hidden = true;
			this.overlay.style.display = 'none';
		}
		this.session?.dispose();
		this.session = undefined;
		if (resolvePending && this.pending) {
			this.pending.complete();
		}
		this.pending = undefined;
	}
}
