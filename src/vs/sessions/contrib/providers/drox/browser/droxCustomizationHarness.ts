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
import { AICustomizationManagementSection, AICustomizationSources, type AICustomizationSource, IStorageSourceFilter } from '../../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js';
import { IHarnessDescriptor } from '../../../../../workbench/contrib/chat/common/customizationHarnessService.js';
import { DROX_CONFIG_FOLDER, DROX_MD_FILENAME, DROX_RULES_SOURCE_FOLDER, MEMORY_MD_FILENAME } from '../../../../../workbench/contrib/chat/common/promptSyntax/config/promptFileLocations.js';
import { PromptsType } from '../../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js';

const DROX_HARNESS_SOURCES: readonly AICustomizationSource[] = [
	AICustomizationSources.local,
	AICustomizationSources.user,
	AICustomizationSources.builtin,
];

const DROX_HOOKS_FILTER: IStorageSourceFilter = {
	sources: [AICustomizationSources.local, AICustomizationSources.user],
};

/**
 * User-home roots scanned by the Drox harness (skills, rules, etc.).
 */
export function getDroxUserRoots(userHome: URI): readonly URI[] {
	return [joinPath(userHome, DROX_CONFIG_FOLDER)];
}

/**
 * Harness descriptor for Drox Agents sessions — Skills, Instructions, MCP
 * under workspace `.drox/` and user `~/.drox`, without Copilot Plugins/Tools.
 */
export function createDroxHarnessDescriptor(userHome: URI): IHarnessDescriptor {
	const droxUserRoots = getDroxUserRoots(userHome);
	const allRootsFilter: IStorageSourceFilter = { sources: DROX_HARNESS_SOURCES };
	const restrictedFilter: IStorageSourceFilter = {
		sources: DROX_HARNESS_SOURCES,
		includedUserFileRoots: droxUserRoots,
	};

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
		workspaceSubpaths: [DROX_CONFIG_FOLDER],
		instructionFileFilter: [
			DROX_MD_FILENAME,
			MEMORY_MD_FILENAME,
			`${DROX_RULES_SOURCE_FOLDER}/`,
		],
		sectionOverrides: new Map([
			[AICustomizationManagementSection.Instructions, {
				rootFileShortcuts: [DROX_MD_FILENAME, MEMORY_MD_FILENAME],
			}],
		]),
		getStorageSourceFilter(type: PromptsType): IStorageSourceFilter {
			if (type === PromptsType.hook) {
				return DROX_HOOKS_FILTER;
			}
			if (type === PromptsType.prompt) {
				return allRootsFilter;
			}
			return restrictedFilter;
		},
	};
}
