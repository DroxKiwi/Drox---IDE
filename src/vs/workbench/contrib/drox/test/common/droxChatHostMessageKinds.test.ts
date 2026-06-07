/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { FileAccess } from '../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DROX_HOST_TO_WEBVIEW_MESSAGE_KINDS, isDroxHostToWebviewMessageKind } from '../../common/droxChatHostMessageKinds.js';

function extractHostMessageSwitchCases(source: string): string[] {
	const cases: string[] = [];
	const re = /case\s+'([^']+)'\s*:/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) {
		cases.push(m[1]);
	}
	return [...new Set(cases)].sort();
}

suite('Drox chat host message kinds', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('registry matches host-message.js switch cases', () => {
		const hostMessagePath = FileAccess.asFileUri(
			'vs/workbench/contrib/drox/browser/media/droxChat/bridge/host-message.js',
		).fsPath;
		const source = readFileSync(hostMessagePath, 'utf8');
		const jsKinds = extractHostMessageSwitchCases(source);
		const registry = [...DROX_HOST_TO_WEBVIEW_MESSAGE_KINDS].sort();

		const missingInRegistry = jsKinds.filter(k => !isDroxHostToWebviewMessageKind(k));
		const missingInJs = registry.filter(k => !jsKinds.includes(k));

		assert.deepStrictEqual(
			missingInRegistry,
			[],
			`host-message.js cases missing from droxChatHostMessageKinds.ts: ${missingInRegistry.join(', ')}`,
		);
		assert.deepStrictEqual(
			missingInJs,
			[],
			`droxChatHostMessageKinds.ts entries missing from host-message.js: ${missingInJs.join(', ')}`,
		);
	});
});
