/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { constObservable, derived, derivedOpts, IObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import {
	IChat,
	ISessionChangeset,
	ISessionChangesetOperation,
	ISessionChangesetOperationTarget,
	ISessionFileChange,
	sessionFileChangesEqual,
} from '../../../../services/sessions/common/session.js';
import { isIChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { matchGitRootForPath } from '../../../../../workbench/contrib/drox/common/droxDiscoverGitRoots.js';

function changeFsPath(change: ISessionFileChange): string | undefined {
	if (isIChatSessionFileChange2(change)) {
		return (change.modifiedUri ?? change.uri)?.fsPath;
	}
	return change.modifiedUri?.fsPath;
}

/**
 * Changeset filtré sur un root git (ou tous les fichiers si `gitRoot` est undefined).
 */
export class DroxSessionFileChangesChangeset implements ISessionChangeset {

	static readonly ID = 'droxSessionChanges';

	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly category: string;

	readonly isEnabled = constObservable(true);
	readonly isDefault: IObservable<boolean>;
	readonly isLoadingChanges = constObservable(false);
	readonly originalCheckpointRef = constObservable<string | undefined>(undefined);
	readonly modifiedCheckpointRef = constObservable<string | undefined>(undefined);
	readonly operations = constObservable<readonly ISessionChangesetOperation[]>([]);

	readonly changes: IObservable<readonly ISessionFileChange[]>;

	constructor(
		chatsObs: IObservable<readonly IChat[]>,
		options?: {
			readonly gitRoot?: URI;
			readonly isDefault?: boolean;
			readonly allRoots?: readonly URI[];
		},
	) {
		const gitRoot = options?.gitRoot;
		const allRoots = options?.allRoots ?? (gitRoot ? [gitRoot] : []);
		const rootLabel = gitRoot ? basename(gitRoot) : localize('drox.sessionChanges.category', 'Changes');
		this.id = gitRoot
			? `droxSessionChanges:${gitRoot.toString()}`
			: DroxSessionFileChangesChangeset.ID;
		this.label = gitRoot
			? localize('drox.sessionChanges.rootLabel', '{0}', rootLabel)
			: localize('drox.sessionChanges.label', 'Session & Workspace Changes');
		this.description = gitRoot
			? localize('drox.sessionChanges.rootDescription', 'Agent + uncommitted changes in {0}', rootLabel)
			: localize('drox.sessionChanges.description', 'Agent changes merged with uncommitted git files');
		this.category = rootLabel;
		this.isDefault = constObservable(options?.isDefault ?? true);

		this.changes = derivedOpts({ equalsFn: sessionFileChangesEqual }, reader => {
			const chats = chatsObs.read(reader);
			const first = chats[0];
			const all = first ? first.changes.read(reader) : [];
			if (!gitRoot) {
				return all;
			}
			return all.filter(change => {
				const path = changeFsPath(change);
				if (!path) {
					return false;
				}
				const matched = matchGitRootForPath(allRoots.length > 0 ? allRoots : [gitRoot], path);
				return matched?.toString() === gitRoot.toString();
			});
		});
	}

	async invokeOperation(_operationId: string, _target?: ISessionChangesetOperationTarget): Promise<void> {
		// Drox session changes are read-only in the Changes view for 1.5.12+.
	}
}

export interface IDroxSessionChangesetsController {
	readonly changesets: IObservable<readonly ISessionChangeset[]>;
	setGitRoots(roots: readonly URI[]): void;
}

/**
 * Contrôleur de changesets : 1 catégorie / root git (ou une seule section si 0–1 root).
 */
export function createDroxSessionChangesetsController(
	chatsObs: IObservable<readonly IChat[]>,
): IDroxSessionChangesetsController {
	const gitRootsObs: ISettableObservable<readonly URI[]> = observableValue<readonly URI[]>('droxGitRoots', []);

	const changesets = derived(reader => {
		const roots = gitRootsObs.read(reader);
		if (roots.length === 0) {
			return [new DroxSessionFileChangesChangeset(chatsObs, { isDefault: true })];
		}
		if (roots.length === 1) {
			return [new DroxSessionFileChangesChangeset(chatsObs, {
				gitRoot: roots[0],
				allRoots: roots,
				isDefault: true,
			})];
		}
		return roots.map((root, index) => new DroxSessionFileChangesChangeset(chatsObs, {
			gitRoot: root,
			allRoots: roots,
			isDefault: index === 0,
		}));
	});

	return {
		changesets,
		setGitRoots(roots: readonly URI[]): void {
			gitRootsObs.set(roots, undefined);
		},
	};
}

/** @deprecated Prefer {@link createDroxSessionChangesetsController}. */
export function createDroxSessionChangesets(chatsObs: IObservable<readonly IChat[]>): readonly ISessionChangeset[] {
	return [new DroxSessionFileChangesChangeset(chatsObs, { isDefault: true })];
}
