/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extname } from '../../../../base/common/path.js';



export function languageIdForFile(filePath: string): string {

	const ext = extname(filePath).toLowerCase();

	const map: Record<string, string> = {

		'.ts': 'typescript',

		'.tsx': 'typescriptreact',

		'.js': 'javascript',

		'.jsx': 'javascriptreact',

		'.json': 'json',

		'.ipynb': 'json',

		'.jsonc': 'jsonc',

		'.md': 'markdown',

		'.rs': 'rust',

		'.toml': 'toml',

		'.yaml': 'yaml',

		'.yml': 'yaml',

		'.css': 'css',

		'.html': 'html',

		'.py': 'python',

	};

	return map[ext] ?? 'plaintext';

}

