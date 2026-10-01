/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqualOrParent, relativePath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { droxCodebaseShouldSkipDirName, droxCodebaseShouldSkipFileName } from '../droxCodebaseIgnore.js';

/** Returns a workspace-relative posix path to invalidate, or undefined to skip. */
export function droxCodebaseInvalidateRelativePath(root: URI, uri: URI): string | undefined {
	if (!isEqualOrParent(uri, root)) {
		return undefined;
	}
	const rel = relativePath(root, uri);
	if (!rel) {
		return undefined;
	}
	const norm = rel.replace(/\\/g, '/');
	if (norm.startsWith('.drox/') || norm.split('/').some(seg => droxCodebaseShouldSkipDirName(seg))) {
		return undefined;
	}
	const base = norm.includes('/') ? norm.slice(norm.lastIndexOf('/') + 1) : norm;
	if (droxCodebaseShouldSkipFileName(base)) {
		return undefined;
	}
	return norm;
}
