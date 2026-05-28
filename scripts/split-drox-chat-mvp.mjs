/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(root, 'src/vs/workbench/contrib/drox/browser/media/droxChatMvp.js');
const outDir = path.join(root, 'src/vs/workbench/contrib/drox/browser/media/droxChat');
const backupPath = srcPath + '.bak';

const header = '// Copyright (c) 2026 KDDS. Drox integration for KDDS Nexus.\n\n';

const ranges = [
	['00-context.js', 0, 217],
	['01-chrome.js', 217, 395],
	['02-composer.js', 395, 1078],
	['03-history.js', 1078, 1258],
	['04-attachments.js', 1258, 1488],
	['05-userAsk.js', 1488, 1668],
	['06-log.js', 1668, 2191],
	['07-host.js', 2326, 2543],
	['08-bootstrap.js', 2191, 2325],
];

const domIds = [
	'logEl', 'promptEl', 'refsEl', 'sendBtn', 'sendActionIconSend', 'sendActionIconStop',
	'statusEl', 'statTokensIn', 'statTokensOut', 'statCtx', 'progressEl', 'userAskEl',
	'composerEl', 'pendingPromptsEl', 'sendQueueBadge', 'sessionTabsListEl',
	'stickyRunObjectiveEl', 'attachmentsEl', 'attachBtn', 'addRefsBtn', 'fileInput',
	'historyToggleBtn', 'historyCloseBtn', 'historyPanel', 'historyList', 'newChatBtn',
	'openSettingsBtn', 'agentVignettesEl', 'suggestionsEl',
];

const stateVars = [
	'selectedPermissionMode', 'pathCompleteSeq', 'pathCompletePendingId', 'pathCompleteTimer',
	'pathSuggestions', 'busy', 'compactBusy', 'pendingPrompts', 'attachments', 'references',
	'pasteAttachments', 'userAskPending', 'pendingUserAsk', 'assistantEl', 'currentPhase',
	'currentPhaseEl', 'currentPhaseBodyEl', 'currentTodoBlockEl', 'todoSnapshot',
	'currentActivityGridEl', 'currentWarmupRowEl', 'openTabs', 'activeTabId', 'currentSessionId',
	'totalIn', 'totalOut', 'ctxTokens',
];

const constNames = [
	'MODE_STORAGE_KEY', 'VALID_MODES', 'PENDING_SNIPPET_MAX', 'DEFAULT_PROMPT_PLACEHOLDER',
	'WARMUP_PHRASES', 'DEFAULT_SESSION_TAB_TITLE', 'PHASE_META', 'TODO_STATUS_META',
];

const pasteCandidates = 'pasteCandidates'; // const Map

function transformBody(body) {
	let s = body;
	// function foo( -> api.foo = function (
	s = s.replace(/\n\tfunction ([a-zA-Z0-9_]+)\(/g, '\n\tapi.$1 = function (');
	// initAgentVignettes stays as api.initAgentVignettes after above
	// const/let dom elements
	for (const id of domIds) {
		s = s.replaceAll(`\tconst ${id} =`, `\tdom.${id} =`);
		s = s.replaceAll(`\tlet ${id} =`, `\tdom.${id} =`);
	}
	// state
	for (const v of stateVars) {
		s = s.replaceAll(`\tlet ${v} =`, `\tstate.${v} =`);
	}
	s = s.replaceAll('\tconst pasteCandidates =', '\tstate.pasteCandidates =');
	s = s.replaceAll('\tconst toolBlocks =', '\tstate.toolBlocks =');
	// constants on C
	for (const c of constNames) {
		s = s.replaceAll(`\tconst ${c} =`, `\tC.${c} =`);
	}
	// vscode
	s = s.replace('\tconst vscode = acquireVsCodeApi();', '\tD.vscode = acquireVsCodeApi();');
	// prompt helpers use dom.promptEl
	s = s.replaceAll('promptEl.', 'dom.promptEl.');
	s = s.replaceAll('promptEl)', 'dom.promptEl)');
	// replace bare identifiers (longest first)
	const all = [...domIds, ...stateVars, 'pasteCandidates', 'toolBlocks', 'vscode'].sort((a, b) => b.length - a.length);
	for (const name of all) {
		const target = name === 'vscode' ? 'D.vscode' : domIds.includes(name) ? `dom.${name}` : `state.${name}`;
		s = s.replace(new RegExp(`(?<![.a-zA-Z0-9_])${name}(?![a-zA-Z0-9_])`, 'g'), target);
	}
	for (const c of constNames) {
		s = s.replace(new RegExp(`(?<![.a-zA-Z0-9_])${c}(?![a-zA-Z0-9_])`, 'g'), `C.${c}`);
	}
	// fix double dom.dom
	s = s.replaceAll('dom.dom.', 'dom.');
	s = s.replaceAll('state.state.', 'state.');
	s = s.replaceAll('C.C.', 'C.');
	s = s.replaceAll('D.D.', 'D.');
	// function calls that became api.api
	s = s.replaceAll('api.api.', 'api.');
	return s;
}

const src = fs.readFileSync(srcPath, 'utf8');
if (!fs.existsSync(backupPath)) {
	fs.copyFileSync(srcPath, backupPath);
}
const lines = src.split(/\r?\n/);
const inner = lines.slice(3, lines.length - 2);

fs.mkdirSync(outDir, { recursive: true });

const ctxBody = transformBody(inner.slice(0, 218).join('\n'));
const ctxFile =
	header +
	'(function (global) {\n' +
	'\tconst D = global.DroxChat || (global.DroxChat = { api: {}, dom: {}, state: {}, const: {} });\n' +
	'\tconst api = D.api;\n' +
	'\tconst dom = D.dom;\n' +
	'\tconst state = D.state;\n' +
	'\tconst C = D.const;\n' +
	ctxBody +
	'\n})(typeof globalThis !== "undefined" ? globalThis : window);\n';
fs.writeFileSync(path.join(outDir, '00-context.js'), ctxFile);

for (const [file, start, end] of ranges.slice(1)) {
	const body = transformBody(inner.slice(start, end + 1).join('\n'));
	const out =
		header +
		'(function (D) {\n' +
		'\tconst api = D.api;\n' +
		'\tconst dom = D.dom;\n' +
		'\tconst state = D.state;\n' +
		'\tconst C = D.const;\n' +
		body +
		'\n})(globalThis.DroxChat);\n';
	fs.writeFileSync(path.join(outDir, file), out);
}

const entry =
	header +
	'// Legacy entry — scripts are loaded from droxChat/*.js (see droxChatWebview.ts).\n';
fs.writeFileSync(srcPath, entry);

console.log('OK:', outDir, '(backup:', backupPath + ')');
