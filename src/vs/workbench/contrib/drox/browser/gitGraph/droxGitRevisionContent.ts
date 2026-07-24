/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ILocalGitService } from '../../../../../platform/git/common/localGitService.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../common/contributions.js';

export const DROX_GIT_REVISION_SCHEME = 'drox-git';

/** Special rev token → empty buffer (added/deleted sides of a diff). */
export const DROX_GIT_EMPTY_REV = '~';

interface IDroxGitRevisionQuery {
	readonly repoRoot: string;
	readonly rev: string;
}

export function createDroxGitRevisionUri(repoRoot: URI, rev: string, relativePath: string): URI {
	const normalized = relativePath.replace(/\\/g, '/');
	return URI.from({
		scheme: DROX_GIT_REVISION_SCHEME,
		path: `/${normalized}`,
		query: JSON.stringify({ repoRoot: repoRoot.fsPath, rev } satisfies IDroxGitRevisionQuery),
		fragment: rev === DROX_GIT_EMPTY_REV ? 'empty' : rev.slice(0, 8),
	});
}

export function parseDroxGitRevisionUri(resource: URI): { repoRoot: string; rev: string; relativePath: string } | undefined {
	if (resource.scheme !== DROX_GIT_REVISION_SCHEME) {
		return undefined;
	}
	let query: IDroxGitRevisionQuery;
	try {
		query = JSON.parse(resource.query) as IDroxGitRevisionQuery;
	} catch {
		return undefined;
	}
	if (typeof query?.repoRoot !== 'string' || typeof query?.rev !== 'string') {
		return undefined;
	}
	const relativePath = resource.path.replace(/^\//, '');
	if (!relativePath) {
		return undefined;
	}
	return { repoRoot: query.repoRoot, rev: query.rev, relativePath };
}

export class DroxGitRevisionContentProvider implements ITextModelContentProvider {
	constructor(
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILocalGitService private readonly _localGitService: ILocalGitService,
	) { }

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const parsed = parseDroxGitRevisionUri(resource);
		if (!parsed) {
			return null;
		}

		const existing = this._modelService.getModel(resource);
		if (existing && !existing.isDisposed()) {
			return existing;
		}

		let value = '';
		if (parsed.rev !== DROX_GIT_EMPTY_REV) {
			value = await this._localGitService.getFileAtRevision(parsed.repoRoot, parsed.rev, parsed.relativePath) ?? '';
		}

		const language = this._languageService.createByFilepathOrFirstLine(
			URI.file(parsed.relativePath),
			value.split(/\r?\n/, 1)[0],
		);
		return this._modelService.createModel(value, language, resource, false);
	}
}

class DroxGitRevisionContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.drox.gitRevisionContent';

	constructor(
		@ITextModelService textModelService: ITextModelService,
		@IModelService modelService: IModelService,
		@ILanguageService languageService: ILanguageService,
		@ILocalGitService localGitService: ILocalGitService,
	) {
		super();
		this._register(textModelService.registerTextModelContentProvider(
			DROX_GIT_REVISION_SCHEME,
			new DroxGitRevisionContentProvider(modelService, languageService, localGitService),
		));
	}
}

registerWorkbenchContribution2(DroxGitRevisionContribution.ID, DroxGitRevisionContribution, WorkbenchPhase.BlockRestore);
