/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { constObservable, derivedOpts, IObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import {
	IChat,
	ISessionChangeset,
	ISessionChangesetOperation,
	ISessionChangesetOperationTarget,
	ISessionFileChange,
	sessionFileChangesEqual,
} from '../../../../services/sessions/common/session.js';

/**
 * Changeset par défaut pour Drox : lit {@link IChat.changes} (alimenté par le moteur / replay).
 * Le panneau Changes Agents consomme les changesets, pas `ISession.changes` directement.
 */
export class DroxSessionFileChangesChangeset implements ISessionChangeset {

	static readonly ID = 'droxSessionChanges';

	readonly id = DroxSessionFileChangesChangeset.ID;
	readonly label = localize('drox.sessionChanges.label', 'Session & Workspace Changes');
	readonly description = localize('drox.sessionChanges.description', 'Agent changes merged with uncommitted git files');
	readonly category = localize('drox.sessionChanges.category', 'Changes');

	readonly isEnabled = constObservable(true);
	readonly isDefault = constObservable(true);
	readonly isLoadingChanges = constObservable(false);
	readonly originalCheckpointRef = constObservable<string | undefined>(undefined);
	readonly modifiedCheckpointRef = constObservable<string | undefined>(undefined);
	readonly operations = constObservable<readonly ISessionChangesetOperation[]>([]);

	readonly changes: IObservable<readonly ISessionFileChange[]>;

	constructor(chatsObs: IObservable<readonly IChat[]>) {
		this.changes = derivedOpts({ equalsFn: sessionFileChangesEqual }, reader => {
			const chats = chatsObs.read(reader);
			const first = chats[0];
			return first ? first.changes.read(reader) : [];
		});
	}

	async invokeOperation(_operationId: string, _target?: ISessionChangesetOperationTarget): Promise<void> {
		// Drox session changes are read-only in the Changes view for 1.5.12.
	}
}

export function createDroxSessionChangesets(chatsObs: IObservable<readonly IChat[]>): readonly ISessionChangeset[] {
	return [new DroxSessionFileChangesChangeset(chatsObs)];
}
