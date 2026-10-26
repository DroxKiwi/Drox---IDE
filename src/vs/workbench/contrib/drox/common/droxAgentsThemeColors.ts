/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../nls.js';
import { registerColor } from '../../../../platform/theme/common/colorUtils.js';

/** Accent sobre (charte Drox) pour statuts Agents (pastilles unread, in-progress). */
export const droxAgentsStatusAccent = registerColor(
	'drox.agentsStatusAccent',
	{
		dark: '#888888',
		light: '#666666',
		hcDark: '#aaaaaa',
		hcLight: '#555555',
	},
	localize('drox.agentsStatusAccent', 'Accent color for agent session status indicators in the Drox Agents window.'),
);
