/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, 'src/vs/workbench/contrib/drox/browser/media/droxChat/_legacy-flat');

const apiNames = [
	'getPromptText', 'setPromptText', 'clearPromptText', 'isPromptTextEmpty', 'getPromptCursor', 'placeCaretAtEnd',
	'getPermissionMode', 'syncAgentVignetteUi', 'setPermissionMode', 'loadPermissionMode', 'initAgentVignettes',
	'randomId', 'updateSendActionButton', 'updateComposerChrome', 'setCompactBusy', 'setBusy', 'getModeBadgeLabel',
	'nextPendingTodoLabel', 'hideActivity', 'pickWarmupPhrase', 'showWarmupActivity', 'buildActivityGrid',
	'showActivityOnSummary', 'showActivityOnCurrentPhaseSummary', 'showActivityBeforeNode', 'renderTodos',
	'snippetForPending', 'renderPendingPrompts', 'isComposerEmpty', 'pasteLineRef', 'normalizeForHash', 'fnv1a32',
	'updatePromptPlaceholder', 'renderRefs', 'findAtCompletionContext', 'hidePathSuggestions', 'renderPathSuggestions',
	'applyPathSuggestion', 'schedulePathComplete', 'pathSuggestionsOpen', 'prefillComposer', 'restoreComposerFromPayload',
	'fileUriToPath', 'labelFor', 'refKey', 'addUriRefs', 'snapshotComposerPayload', 'clearComposerAfterSend',
	'parseSlashCommand', 'tryEnqueueFromComposer', 'performSend', 'flushPendingPromptQueue', 'doSend',
	'relativeTime', 'formatBytes', 'openHistory', 'closeHistory', 'toggleHistory', 'newChat', 'renderHistory',
	'formatTokens', 'renderStatus', 'resetChatUi', 'fileIsImage', 'readAsDataUrl', 'renderAttachments',
	'addHostAttachments', 'setDropHighlight', 'parseUriListLines', 'handleComposerDrop', 'handleComposerDragOver',
	'handleComposerDragLeave', 'addFiles', 'openUserAskCard', 'closeUserAskCard', 'renderUserAskCard',
	'advanceOrSubmitUserAsk', 'skipUserAsk', 'submitUserAsk', 'scrollLog', 'basenameForRef', 'renderUserMessage',
	'appendMemoryChip', 'currentContainer', 'closeCurrentPhase', 'openPhaseBlock', 'enterPhase', 'appendMessage',
	'finalizeAssistant', 'appendDelta', 'createToolBlock', 'finishToolBlock', 'tabDisplayTitle', 'findSessionTabElement',
	'updateSessionTabElement', 'animateSessionTabClose', 'createSessionTabElement', 'reorderSessionTabs',
	'renderSessionTabs', 'setRunObjectiveSticky', 'hideRunObjectiveSticky', 'handleToolEvent', 'abortRunLocally',
	'handleSendButtonClick', 'handleHostMessage',
];

for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
	let s = fs.readFileSync(path.join(dir, file), 'utf8');
	if (file === '00-context.js') {
		s = s.replace("getElementById('state.attachments')", "getElementById('attachments')");
	}
	if (file === '08-bootstrap.js') {
		if (!s.includes('api.handleToolEvent = function')) {
			s = s.replace(
				/(const C = D\.const;\n)\t\tconst id = String/,
				'$1\tapi.handleToolEvent = function (payload) {\n\t\tconst id = String',
			);
		}
	}
	s = s.replace(/\n\tasync function ([a-zA-Z0-9_]+)\(/g, '\n\tapi.$1 = async function (');
	for (const name of apiNames.sort((a, b) => b.length - a.length)) {
		// skip api.foo = function and api.foo(
		s = s.replace(new RegExp(`(?<!api\\.)(?<![a-zA-Z0-9_])${name}(?=\\s*\\()`, 'g'), `api.${name}`);
	}
	fs.writeFileSync(path.join(dir, file), s);
}

let host = fs.readFileSync(path.join(dir, '07-host.js'), 'utf8');
host = host.replace(
	"window.addEventListener('message', (event) => {\n\t\tconst m = event.data;",
	'api.handleHostMessage = function (m) {',
);
host = host.replace(/\n\t\}\);\n\}\)\(globalThis\.DroxChat\);/, '\n\t};\n})(globalThis.DroxChat);');
fs.writeFileSync(path.join(dir, '07-host.js'), host);

let boot = fs.readFileSync(path.join(dir, '08-bootstrap.js'), 'utf8');
if (!boot.includes('webviewReady')) {
	boot = boot.replace(
		/\}\)\(globalThis\.DroxChat\);\s*$/,
		`\n\twindow.addEventListener('message', (event) => {\n\t\tapi.handleHostMessage(event.data);\n\t});\n\n\tapi.updateComposerChrome();\n\tapi.updatePromptPlaceholder();\n\tapi.renderRefs();\n\tapi.renderSessionTabs();\n\n\tD.vscode.postMessage({ type: 'webviewReady' });\n})(globalThis.DroxChat);\n`,
	);
	fs.writeFileSync(path.join(dir, '08-bootstrap.js'), boot);
}

console.log('fixed modules');
