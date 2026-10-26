/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { localize } from '../../../../../nls.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';

export const enum DroxMotionSetting {
	IdeEditorRevealEnabled = 'drox.motion.ide.editorReveal.enabled',
}

export function registerDroxMotionConfiguration(): void {
	const registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	registry.registerConfiguration({
		id: 'droxMotion',
		title: localize('droxMotionConfigurationTitle', 'Drox Motion'),
		scope: ConfigurationScope.APPLICATION,
		properties: {
			[DroxMotionSetting.IdeEditorRevealEnabled]: {
				type: 'boolean',
				default: true,
				description: localize(
					'droxMotion.ideEditorReveal.enabled',
					'Play a short code-themed reveal when a source file opens in the IDE editor (not in the Agents window).',
				),
			},
		},
	});
}
