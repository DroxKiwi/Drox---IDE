/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { format } from '../build/lib/formatter.ts';

const root = path.resolve(import.meta.dirname, '..');

function dedupeBlankLines(text) {
	let prev;
	do {
		prev = text;
		text = text.replace(/\r?\n(?:[ \t]*\r?\n)+/g, '\n');
	} while (text !== prev);
	return text;
}

function fixTsOrJs(filePath) {
	let text = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
	text = dedupeBlankLines(text);
	if (filePath.endsWith('.ts')) {
		text = format(path.resolve(filePath), text);
	}
	fs.writeFileSync(filePath, text.replace(/\n/g, '\r\n'), 'utf8');
}

function fixSplitMjs(filePath) {
	const text = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
	const header = `/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
`;
	const usage = [];
	const rest = [];
	let inHeader = false;
	let pastHeader = false;
	for (const line of text.split('\n')) {
		if (!pastHeader) {
			if (line.startsWith('/*---------------------------------------------------------------------------------------------')) {
				inHeader = true;
			}
			if (inHeader) {
				if (line.includes('*/') && line.trimEnd().endsWith('*/')) {
					pastHeader = true;
				}
				continue;
			}
		}
		if (line.startsWith('// ') && !line.includes('allow-any-unicode')) {
			usage.push(line);
			continue;
		}
		rest.push(line);
	}
	const body = dedupeBlankLines(rest.join('\n').trimStart());
	const usageBlock = usage.length ? `${usage.join('\n')}\n\n` : '';
	fs.writeFileSync(filePath, `${header}\n${body.replace(/^((?:import[^\n]*\n)+)/, `$1\n${usageBlock}`).replace(/\n/g, '\r\n')}`, 'utf8');
}

const droxFiles = [
	'src/vs/workbench/contrib/drox/browser/chat/droxChatGeneralSettings.ts',
	'src/vs/workbench/contrib/drox/browser/chat/droxChatRoleModels.ts',
	'src/vs/workbench/contrib/drox/browser/droxTelemetryContribution.ts',
	'src/vs/workbench/contrib/drox/browser/droxHelpMenuContribution.ts',
	'src/vs/workbench/contrib/drox/browser/droxExternalUrlRemapContribution.ts',
	'src/vs/workbench/contrib/drox/common/droxExternalUrlRemap.ts',
	'src/vs/workbench/contrib/drox/common/droxProductUrls.ts',
	'src/vs/workbench/contrib/drox/common/droxDevConfiguration.ts',
	'src/vs/workbench/contrib/drox/common/droxDevSurface.ts',
	'src/vs/workbench/contrib/drox/common/droxRunSettings.ts',
	'src/vs/workbench/contrib/drox/electron-browser/droxRunSettingsService.ts',
	'src/vs/workbench/contrib/drox/test/common/droxExternalUrlRemap.test.ts',
	'src/vs/workbench/contrib/drox/browser/media/droxChat/stream/discussion/state.js',
];

const mjsFiles = [
	'scripts/split-00-context.mjs',
	'scripts/split-01c-role-models.mjs',
	'scripts/split-01d-general-settings.mjs',
	'scripts/split-02-chrome.mjs',
	'scripts/split-03-composer.mjs',
	'scripts/split-07-log.mjs',
	'scripts/split-07b-runTimeline.mjs',
	'scripts/split-09-host.mjs',
	'scripts/validate-gate-graph.mjs',
	'scripts/sync-gate-routes-from-graph.mjs',
];

for (const rel of droxFiles) {
	fixTsOrJs(path.join(root, rel));
	console.log('fixed drox', rel);
}
for (const rel of mjsFiles) {
	fixSplitMjs(path.join(root, rel));
	console.log('fixed mjs', rel);
}
