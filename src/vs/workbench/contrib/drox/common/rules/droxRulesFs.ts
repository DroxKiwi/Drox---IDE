/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { DROX_CONFIG_FOLDER, DROX_RULES_SOURCE_FOLDER } from '../../../chat/common/promptSyntax/config/promptFileLocations.js';
import { formatDroxRulesAnnex } from './droxRulesFormat.js';
import { isDroxRuleFilename, parseDroxRuleMarkdown } from './droxRulesParse.js';
import { selectDroxRulesForRun } from './droxRulesSelect.js';
import { IDroxRule, IDroxRulesAnnexResult } from './droxRulesTypes.js';

async function readRulesFromFolder(
	fileService: IFileService,
	folder: URI,
	pathPrefix: string,
): Promise<IDroxRule[]> {
	const out: IDroxRule[] = [];
	try {
		if (!(await fileService.exists(folder))) {
			return out;
		}
		const entries = await fileService.resolve(folder);
		if (!entries.children?.length) {
			return out;
		}
		for (const child of entries.children) {
			if (!child.isFile || !child.name || !isDroxRuleFilename(child.name)) {
				continue;
			}
			// Skip README / MEMORY-style noise if someone drops them here.
			const lower = child.name.toLowerCase();
			if (lower === 'readme.md' || lower === 'memory.md') {
				continue;
			}
			try {
				const content = await fileService.readFile(child.resource);
				const text = content.value.toString();
				const relativePath = `${pathPrefix}/${child.name}`.replace(/\\/g, '/');
				const rule = parseDroxRuleMarkdown(text, {
					id: child.name.replace(/\.instructions\.md$/i, '').replace(/\.mdc$/i, '').replace(/\.md$/i, ''),
					relativePath,
				});
				if (rule) {
					out.push(rule);
				}
			} catch {
				// skip unreadable file
			}
		}
	} catch {
		// folder missing / unreadable
	}
	return out;
}

export interface IDroxCollectRulesOpts {
	readonly contextPaths?: readonly string[];
	readonly maxChars?: number;
	/** Optional user home FS path for `~/.drox/rules`. */
	readonly userHomeFsPath?: string;
}

/**
 * Load + select + format project rules for an agent run.
 */
export async function collectDroxRulesSystemAnnex(
	fileService: IFileService,
	workspaceFsPath: string,
	opts?: IDroxCollectRulesOpts,
): Promise<IDroxRulesAnnexResult | undefined> {
	const ws = URI.file(workspaceFsPath);
	const workspaceRules = await readRulesFromFolder(
		fileService,
		URI.joinPath(ws, DROX_CONFIG_FOLDER, 'rules'),
		DROX_RULES_SOURCE_FOLDER,
	);

	let userRules: IDroxRule[] = [];
	if (opts?.userHomeFsPath?.trim()) {
		userRules = await readRulesFromFolder(
			fileService,
			URI.joinPath(URI.file(opts.userHomeFsPath.trim()), DROX_CONFIG_FOLDER, 'rules'),
			`~/${DROX_RULES_SOURCE_FOLDER}`,
		);
	}

	// Workspace rules win on same id.
	const byId = new Map<string, IDroxRule>();
	for (const r of userRules) {
		byId.set(r.id, r);
	}
	for (const r of workspaceRules) {
		byId.set(r.id, r);
	}

	const selected = selectDroxRulesForRun([...byId.values()], {
		contextPaths: opts?.contextPaths,
	});
	// Stable order: workspace-relative path then id.
	selected.sort((a, b) => a.relativePath.localeCompare(b.relativePath) || a.id.localeCompare(b.id));

	return formatDroxRulesAnnex(selected, { maxChars: opts?.maxChars });
}
