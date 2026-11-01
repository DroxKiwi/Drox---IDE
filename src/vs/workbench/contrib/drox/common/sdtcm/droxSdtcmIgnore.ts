/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** File name inside `.drox`. */
export const DROX_SDTCM_IGNORE_FILE = '.SDTCMignore';

export const DROX_SDTCM_IGNORE_DEFAULT = `# SDTCM — files left out of the tree
# A bare name matches that segment anywhere. A path starts at the workspace root.
# * matches part of a name. Blank lines and # are skipped.

.git
.drox
.vs
.idea
.venv
venv
node_modules
vendor
Pods
Carthage
.gradle
__pycache__
.pytest_cache
.mypy_cache
.tox
.eggs
dist
build
out
target
bin
obj
coverage
.next
.nuxt
.turbo
.cache

.env
.env.*
*.pem
*.key

docker-compose.yml
docker-compose.yaml
compose.yml
compose.yaml
Dockerfile
package-lock.json
*-lock.json
yarn.lock
pnpm-lock.yaml
Cargo.lock
poetry.lock
Gemfile.lock
composer.lock
*.min.js
*.min.css
`;

export function parseDroxSdtcmIgnore(text: string): readonly string[] {
	const patterns: string[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) {
			continue;
		}
		patterns.push(line.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, ''));
	}
	return patterns;
}

/** True when a workspace-relative path must stay out of the tree. */
export function droxSdtcmPathIgnored(relativePath: string, patterns: readonly string[]): boolean {
	const path = relativePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
	if (!path) {
		return false;
	}
	const segments = path.split('/');
	for (const pattern of patterns) {
		if (!pattern) {
			continue;
		}
		if (pattern.includes('/')) {
			if (path === pattern || path.startsWith(`${pattern}/`)) {
				return true;
			}
			continue;
		}
		if (segments.some(segment => droxSdtcmNameMatches(segment, pattern))) {
			return true;
		}
	}
	return false;
}

function droxSdtcmNameMatches(name: string, pattern: string): boolean {
	if (!pattern.includes('*')) {
		return name === pattern;
	}
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
	return new RegExp(`^${escaped}$`).test(name);
}
