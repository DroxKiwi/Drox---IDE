/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import {
	droxPortsOpenUrl,
	parseDroxPortsForwards,
	parseDroxPortsTools,
	resolveDroxPortsLaunch,
	substituteDroxPortsPlaceholders,
} from '../../../common/ports/droxPortsConfig.js';
import { IDroxPortsForward, IDroxPortsTool } from '../../../common/ports/droxPortsTypes.js';

suite('Drox — Ports config', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('substituteDroxPortsPlaceholders fills host/port tokens', () => {
		const out = substituteDroxPortsPlaceholders(
			'-L {{localHost}}:{{localPort}}:{{remoteHost}}:{{remotePort}}',
			{
				localHost: '127.0.0.1',
				localPort: 5173,
				remoteHost: '10.0.0.5',
				remotePort: 3000,
				label: 'app',
				id: 'fwd-1',
			},
		);
		assert.strictEqual(out, '-L 127.0.0.1:5173:10.0.0.5:3000');
	});

	test('resolveDroxPortsLaunch substitutes args and env', () => {
		const tool: IDroxPortsTool = {
			id: 'ssh',
			label: 'SSH',
			command: 'ssh',
			args: ['-N', '-L', '{{localHost}}:{{localPort}}:{{remoteHost}}:{{remotePort}}', 'user@bastion'],
			env: { FWD_LABEL: '{{label}}' },
		};
		const forward: IDroxPortsForward = {
			id: 'vite',
			label: 'Vite',
			remoteHost: '127.0.0.1',
			remotePort: 5173,
			localHost: '127.0.0.1',
			localPort: 5173,
			protocol: 'http',
			onReady: 'preview',
		};
		const launch = resolveDroxPortsLaunch(forward, tool);
		assert.strictEqual(launch.args[2], '127.0.0.1:5173:127.0.0.1:5173');
		assert.strictEqual(launch.env.FWD_LABEL, 'Vite');
	});

	test('parseDroxPortsTools / forwards ignore incomplete rows', () => {
		const tools = parseDroxPortsTools([
			{ id: 'ok', command: 'ssh', args: ['-N'] },
			{ id: 'bad' },
		]);
		assert.strictEqual(tools.length, 1);
		assert.strictEqual(tools[0]!.command, 'ssh');

		const forwards = parseDroxPortsForwards([
			{ id: 'a', remotePort: 8080 },
			{ id: 'b' },
		]);
		assert.strictEqual(forwards.length, 1);
		assert.strictEqual(forwards[0]!.remoteHost, '127.0.0.1');
		assert.strictEqual(forwards[0]!.localPort, 8080);
	});

	test('droxPortsOpenUrl skips tcp', () => {
		assert.strictEqual(droxPortsOpenUrl({
			id: 't',
			label: 't',
			remoteHost: 'h',
			remotePort: 1,
			localHost: '127.0.0.1',
			localPort: 1,
			protocol: 'tcp',
			onReady: 'none',
		}), undefined);
		assert.strictEqual(droxPortsOpenUrl({
			id: 'h',
			label: 'h',
			remoteHost: 'h',
			remotePort: 80,
			localHost: '127.0.0.1',
			localPort: 8080,
			protocol: 'http',
			onReady: 'preview',
		}), 'http://127.0.0.1:8080');
	});
});
