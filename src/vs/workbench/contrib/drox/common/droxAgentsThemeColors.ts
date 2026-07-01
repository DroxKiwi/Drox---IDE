/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../nls.js';
import { registerColor } from '../../../../platform/theme/common/colorUtils.js';

/** Accent vert rétro pour statuts Agents (pastilles unread, in-progress). */
export const droxAgentsStatusAccent = registerColor(
	'drox.agentsStatusAccent',
	{
		dark: '#7a9a6a',
		light: '#3d7a3d',
		hcDark: '#9aa88a',
		hcLight: '#2d5a2d',
	},
	localize('drox.agentsStatusAccent', 'Accent color for agent session status indicators in the Drox Agents window.'),
);
