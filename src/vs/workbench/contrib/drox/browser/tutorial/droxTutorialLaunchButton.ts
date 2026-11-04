/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { $, addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { localize } from '../../../../../nls.js';
import { IDroxTutorialService } from './droxTutorial.js';

/** Book button placed immediately left of the Open Git Graph branch badge. */
export function createDroxTutorialLaunchButton(tutorial: IDroxTutorialService, disposables: DisposableStore): HTMLButtonElement {
	const button = $('button.drox-tutorial-launch') as HTMLButtonElement;
	button.type = 'button';
	button.title = localize('drox.tutorialLaunch', 'Tutorial');
	button.setAttribute('aria-label', localize('drox.tutorialLaunch', 'Tutorial'));
	button.appendChild($('span.drox-tutorial-launch-icon' + ThemeIcon.asCSSSelector(Codicon.book)));

	const stop = (event: Event) => {
		event.preventDefault();
		event.stopPropagation();
	};
	disposables.add(addDisposableListener(button, EventType.MOUSE_DOWN, stop));
	disposables.add(addDisposableListener(button, EventType.CLICK, event => {
		stop(event);
		tutorial.toggle();
	}));
	const sync = () => button.classList.toggle('is-open', tutorial.active);
	disposables.add(tutorial.onDidChange(sync));
	sync();
	return button;
}
