/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../base/browser/dom.js';
import { renderIcon } from '../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../base/common/codicons.js';

/** Class on the hover widget. The frame lives in the SDTCM and composer stylesheets. */
export const DROX_TOKEN_WARNING_HOVER_CLASS = 'drox-sdtcm-token-warning-hover';

/** A fresh node each time: the hover widget takes ownership of the element. */
export function droxTokenWarningHoverContent(text: string): HTMLElement {
	const row = $('.drox-sdtcm-token-warning');
	row.appendChild(renderIcon(Codicon.warning));
	const label = $('span');
	label.textContent = text;
	row.appendChild(label);
	return row;
}
