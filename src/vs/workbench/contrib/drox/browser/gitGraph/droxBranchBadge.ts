/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { $, addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { renderIcon } from '../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IDroxGitGraphService } from '../../common/droxGitGraphService.js';

/**
 * Renders a compact git-branch pill next to a workspace label.
 * Hidden when the folder is not a git repo / has no branch yet.
 */
export class DroxBranchBadge extends Disposable {

	private readonly _el: HTMLElement;
	private readonly _labelEl: HTMLElement;
	private readonly _bindStore = this._register(new DisposableStore());
	private _folder: URI | undefined;

	constructor(
		private readonly _gitGraphService: IDroxGitGraphService,
	) {
		super();
		this._el = $('span.drox-branch-badge');
		this._el.appendChild(renderIcon(Codicon.gitBranch));
		this._labelEl = $('span.drox-branch-badge-label');
		this._el.appendChild(this._labelEl);
		this._el.style.display = 'none';
		this._el.title = localize('drox.branchBadge.title', "Open Git Graph");
		this._el.setAttribute('role', 'button');
		this._el.tabIndex = 0;

		this._register(addDisposableListener(this._el, EventType.CLICK, e => {
			e.preventDefault();
			e.stopPropagation();
			void this._open();
		}));
		this._register(addDisposableListener(this._el, EventType.KEY_DOWN, e => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
				void this._open();
			}
		}));
	}

	get element(): HTMLElement {
		return this._el;
	}

	bind(folder: URI | undefined): void {
		this._bindStore.clear();
		this._folder = folder;
		if (!folder) {
			this._el.style.display = 'none';
			return;
		}

		this._bindStore.add(autorun(reader => {
			const isRepo = this._gitGraphService.isGitRepo(folder).read(reader);
			const branch = this._gitGraphService.currentBranch(folder).read(reader);
			if (!isRepo || !branch) {
				this._el.style.display = 'none';
				return;
			}
			this._labelEl.textContent = branch;
			this._el.style.display = '';
			this._el.setAttribute('aria-label', localize('drox.branchBadge.aria', "Git branch {0}", branch));
		}));
	}

	private async _open(): Promise<void> {
		if (this._folder) {
			await this._gitGraphService.openGitGraph(this._folder);
		}
	}
}
