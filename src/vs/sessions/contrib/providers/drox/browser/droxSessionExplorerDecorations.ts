/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDecorationData, IDecorationsProvider, IDecorationsService } from '../../../../../workbench/services/decorations/common/decorations.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { isDroxAgentsWindowEnabled } from '../../../../../workbench/contrib/drox/common/droxAgentsConfiguration.js';
import { DROX_SESSIONS_PROVIDER_ID } from '../../../../../workbench/contrib/drox/common/droxAgentsSession.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { toIChangesFileItem } from '../../../changes/browser/changesViewRenderer.js';
import { getDroxSessionsProviderInstance } from './droxSessionsProviderAccessor.js';

type SessionChangeDecoration = Pick<IDecorationData, 'letter' | 'tooltip' | 'strikethrough'>;

class DroxSessionExplorerDecorationsProvider extends Disposable implements IDecorationsProvider {

	readonly label = localize('drox.sessionExplorerDecorations', 'Drox Session Changes');

	private readonly _onDidChangeEmitter = this._register(new Emitter<readonly URI[]>());
	readonly onDidChange: Event<readonly URI[]> = this._onDidChangeEmitter.event;

	private readonly _items: { uri: URI; decoration: SessionChangeDecoration }[] = [];
	private _trackedUris: URI[] = [];

	refresh(sessionResource: URI | undefined, providerId: string | undefined): void {
		const previousUris = this._trackedUris;
		this._items.length = 0;
		this._trackedUris = [];

		const droxProvider = getDroxSessionsProviderInstance();
		if (!sessionResource || providerId !== DROX_SESSIONS_PROVIDER_ID || !droxProvider) {
			if (previousUris.length > 0) {
				this._onDidChangeEmitter.fire(previousUris);
			}
			return;
		}

		const fileItems = toIChangesFileItem([...droxProvider.getSessionMergedFileChanges(sessionResource)]);
		for (const item of fileItems) {
			const letter = item.changeType === 'added' ? 'A' : item.changeType === 'deleted' ? 'D' : 'M';
			const tooltip = item.changeType === 'added'
				? localize('drox.sessionExplorerDecoration.added', 'Added by agent session')
				: item.changeType === 'deleted'
					? localize('drox.sessionExplorerDecoration.deleted', 'Deleted by agent session')
					: localize('drox.sessionExplorerDecoration.modified', 'Modified by agent session');
			this._items.push({
				uri: item.uri,
				decoration: { letter, tooltip, strikethrough: item.isDeletion },
			});
			this._trackedUris.push(item.uri);
		}

		const affected = new Map<string, URI>();
		for (const uri of previousUris) {
			affected.set(uri.toString(), uri);
		}
		for (const uri of this._trackedUris) {
			affected.set(uri.toString(), uri);
		}
		if (affected.size > 0) {
			this._onDidChangeEmitter.fire([...affected.values()]);
		}
	}

	provideDecorations(uri: URI, _token: CancellationToken): IDecorationData | undefined {
		for (const entry of this._items) {
			if (isEqual(uri, entry.uri)) {
				return {
					weight: 1001,
					bubble: true,
					letter: entry.decoration.letter,
					tooltip: entry.decoration.tooltip,
					strikethrough: entry.decoration.strikethrough,
				};
			}
		}
		return undefined;
	}
}

class DroxSessionExplorerDecorationsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.droxSessionExplorerDecorations';

	constructor(
		@IDecorationsService decorationsService: IDecorationsService,
		@ISessionsService sessionsService: ISessionsService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();

		if (!isDroxAgentsWindowEnabled(configurationService)) {
			return;
		}

		const provider = this._register(new DroxSessionExplorerDecorationsProvider());
		this._register(decorationsService.registerDecorationsProvider(provider));

		this._register(autorun(reader => {
			const session = sessionsService.activeSession.read(reader);
			if (!session) {
				provider.refresh(undefined, undefined);
				return;
			}
			session.changes.read(reader);
			provider.refresh(session.resource, session.providerId);
		}));
	}
}

registerWorkbenchContribution2(
	DroxSessionExplorerDecorationsContribution.ID,
	DroxSessionExplorerDecorationsContribution,
	WorkbenchPhase.AfterRestored,
);
