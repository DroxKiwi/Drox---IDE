/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../../base/common/codicons.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { DROX_CHAT_SESSION_TYPE } from '../../../../../workbench/contrib/drox/common/droxAgentsSession.js';
import { AICustomizationManagementSection } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IHarnessDescriptor } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { DROX_CONFIG_FOLDER, DROX_MD_FILENAME, MEMORY_MD_FILENAME } from '../../../../../workbench/contrib/chat/common/promptSyntax/config/promptFileLocations.js';

/**
 * User-home roots scanned by the Drox harness (skills, rules, etc.).
 */
export function getDroxUserRoots(userHome: URI): readonly URI[] {
	return [joinPath(userHome, DROX_CONFIG_FOLDER)];
}

/**
 * Harness descriptor for Drox Agents sessions — Skills, Instructions, MCP
 * under workspace `.drox/` and user `~/.drox`, without Copilot Plugins/Tools.
 *
 * @param opts.rulesEnabled When false, hide `.drox/rules` from Instructions
 *   (no create/edit UI for project rules). DROX.md / MEMORY.md remain.
 */
export function createDroxHarnessDescriptor(
	userHome: URI,
	opts?: { readonly rulesEnabled?: boolean },
): IHarnessDescriptor {
	void userHome;
	void opts;
	return {
		id: DROX_CHAT_SESSION_TYPE,
		label: localize('droxCustomizationHarness.label', 'Drox'),
		icon: ThemeIcon.fromId(Codicon.sparkle.id),
		hiddenSections: [
			AICustomizationManagementSection.Plugins,
			AICustomizationManagementSection.Tools,
			AICustomizationManagementSection.Hooks,
		],
		hideGenerateButton: true,
		sectionOverrides: new Map([
			[AICustomizationManagementSection.Instructions, {
				rootFileShortcuts: [DROX_MD_FILENAME, MEMORY_MD_FILENAME],
			}],
		]),
	};
}
