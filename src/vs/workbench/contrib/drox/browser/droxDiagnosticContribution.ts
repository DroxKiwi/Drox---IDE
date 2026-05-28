/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { Position } from '../../../../editor/common/core/position.js';
import { Range } from '../../../../editor/common/core/range.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import {
	CodeAction,
	CodeActionList,
	CodeActionProvider,
	Hover,
	HoverProvider,
} from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { CodeActionKind } from '../../../../editor/contrib/codeAction/common/types.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IMarker, IMarkerService, MarkerSeverity } from '../../../../platform/markers/common/markers.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { DroxCommands, DroxViews } from '../common/drox.js';
import { DroxSetting } from '../common/droxConfiguration.js';
import { IDroxComposerBridgeService } from '../common/droxComposerBridgeService.js';
import {
	formatDiagnosticForComposer,
	IDroxDiagnosticToChatPayload,
	markerContainsPosition,
	markersAtPosition,
	payloadFromMarker,
} from '../common/droxDiagnosticToChat.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';

function isDiagnosticOnHoverEnabled(configService: IConfigurationService): boolean {
	return configService.getValue<boolean>(DroxSetting.AddDiagnosticOnHover) === true;
}

function createPassToModelAction(
	marker: IMarker,
): CodeAction {
	const payload = payloadFromMarker(marker);
	return {
		kind: CodeActionKind.QuickFix.value,
		title: localize('drox.passToModel', 'Send to model'),
		isPreferred: marker.severity === MarkerSeverity.Error,
		command: {
			id: DroxCommands.AddDiagnosticToChat,
			title: localize('drox.passToModel', 'Send to model'),
			arguments: [payload],
		},
	};
}

class DroxDiagnosticCodeActionProvider implements CodeActionProvider {
	constructor(@IMarkerService private readonly markerService: IMarkerService) { }

	provideCodeActions(
		model: ITextModel,
		range: Range | Selection,
		_context: unknown,
		_token: CancellationToken,
	): CodeActionList | undefined {
		const markers = this.markerService.read({ resource: model.uri });
		if (markers.length === 0) {
			return undefined;
		}
		const pos = Selection.isISelection(range)
			? range.getPosition()
			: new Position(range.startLineNumber, range.startColumn);
		const actions: CodeAction[] = [];
		const seen = new Set<string>();
		for (const marker of markers) {
			if (marker.severity === MarkerSeverity.Hint) {
				continue;
			}
			if (!markerContainsPosition(marker, pos.lineNumber, pos.column)) {
				continue;
			}
			const key = `${marker.startLineNumber}:${marker.startColumn}:${marker.message}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			actions.push(createPassToModelAction(marker));
		}
		if (actions.length === 0) {
			return undefined;
		}
		return { actions, dispose: () => { } };
	}
}

class DroxDiagnosticHoverProvider implements HoverProvider {
	constructor(
		@IMarkerService private readonly markerService: IMarkerService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	provideHover(
		model: ITextModel,
		position: Position,
		_token: CancellationToken,
	): Hover | undefined {
		if (!isDiagnosticOnHoverEnabled(this.configurationService)) {
			return undefined;
		}
		const markers = this.markerService.read({ resource: model.uri });
		const visible = markersAtPosition(markers, position.lineNumber, position.column).filter(
			m => m.severity !== MarkerSeverity.Hint,
		);
		if (visible.length === 0) {
			return undefined;
		}

		const contents: MarkdownString[] = [];
		const header = new MarkdownString(visible.map(m => m.message).join('\n\n'));
		contents.push(header);

		for (const marker of visible) {
			const payload = payloadFromMarker(marker);
			const encoded = encodeURIComponent(JSON.stringify(payload));
			const link = new MarkdownString(
				`[${localize('drox.passToModel', 'Send to model')}](command:${DroxCommands.AddDiagnosticToChat}?${encoded})`,
			);
			link.isTrusted = true;
			contents.push(link);
		}
		return { contents, range: new Range(position.lineNumber, position.column, position.lineNumber, position.column) };
	}
}

async function runAddDiagnosticToChat(
	accessor: ServicesAccessor,
	payload: IDroxDiagnosticToChatPayload | undefined,
): Promise<void> {
	if (!payload || typeof payload.uri !== 'string') {
		accessor.get(INotificationService).warn(
			localize('drox.diagnostic.invalid', 'Drox: invalid diagnostic for “Send to model”.'),
		);
		return;
	}
	const viewsService = accessor.get(IViewsService);
	const workspaceContext = accessor.get(IWorkspaceContextService);
	const composerBridge = accessor.get(IDroxComposerBridgeService);

	await viewsService.openView(DroxViews.ChatViewId, true);

	const uri = URI.parse(payload.uri);
	const ws = workspaceContext.getWorkspaceFolder(uri)?.uri.fsPath;
	const text = formatDiagnosticForComposer(uri, payload, ws);
	composerBridge.prefillPrompt(text, false);
}

export function registerDroxDiagnosticToChat(): void {
	registerAction2(class DroxAddDiagnosticToChatAction extends Action2 {
		constructor() {
			super({
				id: DroxCommands.AddDiagnosticToChat,
				title: localize2('drox.addDiagnosticToChat', 'Add Diagnostic to Drox Chat'),
				f1: false,
			});
		}

		override run(accessor: ServicesAccessor, payload?: IDroxDiagnosticToChatPayload): Promise<void> {
			return runAddDiagnosticToChat(accessor, payload);
		}
	});
}

export class DroxDiagnosticContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
		@IMarkerService markerService: IMarkerService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		registerDroxDiagnosticToChat();
		this._register(languageFeaturesService.codeActionProvider.register(
			'*',
			new DroxDiagnosticCodeActionProvider(markerService),
		));
		this._register(languageFeaturesService.hoverProvider.register(
			'*',
			new DroxDiagnosticHoverProvider(markerService, configurationService),
		));
	}
}
