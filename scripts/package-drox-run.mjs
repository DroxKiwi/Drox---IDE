/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptsDir);

if (process.platform === 'win32') {
	const ps1 = join(scriptsDir, 'package-drox.ps1');
	const r = spawnSync(
		'powershell',
		['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1],
		{ cwd: repoRoot, stdio: 'inherit' },
	);
	process.exit(r.status ?? 1);
}

const sh = join(scriptsDir, 'package-drox.sh');
const r = spawnSync(sh, [], { cwd: repoRoot, stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
