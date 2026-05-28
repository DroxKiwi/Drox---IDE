/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const root = path.resolve(import.meta.dirname, '..');
const srcPath = path.join(root, 'src/vs/workbench/contrib/drox/browser/media/droxChatMvp.js');
const bakPath = srcPath + '.bak';
const outDir = path.join(root, 'src/vs/workbench/contrib/drox/browser/media/droxChat');

const header = '// Copyright (c) 2026 KDDS. Drox integration for KDDS Nexus.\n\n';

const MODULE_ORDER = [
	'00-context.js',
	'01-prompt.js',
	'02-chrome.js',
	'03-composer.js',
	'04-history.js',
	'05-attachments.js',
	'06-userAsk.js',
	'07-log.js',
	'08-tabs.js',
	'09-host.js',
	'10-bootstrap.js',
];

const FN_MODULE = {
	getPromptText: '01-prompt.js', setPromptText: '01-prompt.js', clearPromptText: '01-prompt.js',
	isPromptTextEmpty: '01-prompt.js', getPromptCursor: '01-prompt.js', placeCaretAtEnd: '01-prompt.js',
	getPermissionMode: '01-prompt.js', syncAgentVignetteUi: '01-prompt.js', setPermissionMode: '01-prompt.js',
	loadPermissionMode: '01-prompt.js', initAgentVignettes: '01-prompt.js',
	randomId: '02-chrome.js', updateSendActionButton: '02-chrome.js', updateComposerChrome: '02-chrome.js',
	setCompactBusy: '02-chrome.js', setBusy: '02-chrome.js', getModeBadgeLabel: '02-chrome.js',
	nextPendingTodoLabel: '02-chrome.js', hideActivity: '02-chrome.js', pickWarmupPhrase: '02-chrome.js',
	getLastUserMessageEl: '02-chrome.js', showWarmupActivity: '02-chrome.js', buildActivityGrid: '02-chrome.js', showActivityOnSummary: '02-chrome.js',
	showActivityOnCurrentPhaseSummary: '02-chrome.js', showActivityBeforeNode: '02-chrome.js', renderTodos: '02-chrome.js',
	snippetForPending: '03-composer.js', renderPendingPrompts: '03-composer.js', isComposerEmpty: '03-composer.js',
	pasteLineRef: '03-composer.js', normalizeForHash: '03-composer.js', fnv1a32: '03-composer.js',
	updatePromptPlaceholder: '03-composer.js', renderRefs: '03-composer.js', findAtCompletionContext: '03-composer.js',
	hidePathSuggestions: '03-composer.js', renderPathSuggestions: '03-composer.js', applyPathSuggestion: '03-composer.js',
	schedulePathComplete: '03-composer.js', pathSuggestionsOpen: '03-composer.js', prefillComposer: '03-composer.js',
	restoreComposerFromPayload: '03-composer.js', fileUriToPath: '03-composer.js', labelFor: '03-composer.js',
	refKey: '03-composer.js', addUriRefs: '03-composer.js', snapshotComposerPayload: '03-composer.js',
	clearComposerAfterSend: '03-composer.js', parseSlashCommand: '03-composer.js', tryEnqueueFromComposer: '03-composer.js',
	performSend: '03-composer.js', flushPendingPromptQueue: '03-composer.js', doSend: '03-composer.js',
	relativeTime: '04-history.js', formatBytes: '04-history.js', openHistory: '04-history.js',
	closeHistory: '04-history.js', toggleHistory: '04-history.js', newChat: '04-history.js',
	renderHistory: '04-history.js', formatTokens: '04-history.js', renderStatus: '04-history.js', resetChatUi: '04-history.js',
	fileIsImage: '05-attachments.js', readAsDataUrl: '05-attachments.js', renderAttachments: '05-attachments.js',
	addFiles: '05-attachments.js', addHostAttachments: '05-attachments.js', setDropHighlight: '05-attachments.js',
	parseUriListLines: '05-attachments.js', handleComposerDrop: '05-attachments.js',
	handleComposerDragOver: '05-attachments.js', handleComposerDragLeave: '05-attachments.js',
	openUserAskCard: '06-userAsk.js', closeUserAskCard: '06-userAsk.js', renderUserAskCard: '06-userAsk.js',
	advanceOrSubmitUserAsk: '06-userAsk.js', skipUserAsk: '06-userAsk.js', submitUserAsk: '06-userAsk.js',
	scrollLog: '07-log.js', basenameForRef: '07-log.js', renderUserMessage: '07-log.js', appendMemoryChip: '07-log.js',
	currentContainer: '07-log.js', closeCurrentPhase: '07-log.js', openPhaseBlock: '07-log.js', enterPhase: '07-log.js',
	appendMessage: '07-log.js', finalizeAssistant: '07-log.js', appendDelta: '07-log.js',
	createToolBlock: '07-log.js', finishToolBlock: '07-log.js',
	tabDisplayTitle: '08-tabs.js', findSessionTabElement: '08-tabs.js', updateSessionTabElement: '08-tabs.js',
	animateSessionTabClose: '08-tabs.js', createSessionTabElement: '08-tabs.js', reorderSessionTabs: '08-tabs.js',
	renderSessionTabs: '08-tabs.js', setRunObjectiveSticky: '08-tabs.js', hideRunObjectiveSticky: '08-tabs.js',
	handleToolEvent: '09-host.js', abortRunLocally: '09-host.js', handleSendButtonClick: '09-host.js',
};

const ALL_FN = Object.keys(FN_MODULE);

const DOM_IDS = [
	'logEl', 'promptEl', 'refsEl', 'sendBtn', 'sendActionIconSend', 'sendActionIconStop',
	'statusEl', 'statTokensIn', 'statTokensOut', 'statCtx', 'progressEl', 'userAskEl',
	'composerEl', 'pendingPromptsEl', 'sendQueueBadge', 'sessionTabsListEl',
	'stickyRunObjectiveEl', 'attachmentsEl', 'attachBtn', 'addRefsBtn', 'fileInput',
	'historyToggleBtn', 'historyCloseBtn', 'historyPanel', 'historyList', 'newChatBtn',
	'openSettingsBtn', 'agentVignettesEl', 'suggestionsEl',
];

const STATE_VARS = [
	'selectedPermissionMode', 'pathCompleteSeq', 'pathCompletePendingId', 'pathCompleteTimer',
	'pathSuggestions', 'busy', 'compactBusy', 'pendingPrompts', 'attachments', 'references',
	'pasteAttachments', 'userAskPending', 'pendingUserAsk', 'assistantEl', 'currentPhase',
	'currentPhaseEl', 'currentPhaseBodyEl', 'currentTodoBlockEl', 'todoSnapshot',
	'currentActivityGridEl', 'currentWarmupRowEl', 'openTabs', 'activeTabId', 'currentSessionId',
	'totalIn', 'totalOut', 'ctxTokens', 'pasteCandidates', 'toolBlocks',
];

const CONST_NAMES = [
	'MODE_STORAGE_KEY', 'VALID_MODES', 'PENDING_SNIPPET_MAX', 'DEFAULT_PROMPT_PLACEHOLDER',
	'WARMUP_PHRASES', 'DEFAULT_SESSION_TAB_TITLE', 'PHASE_META', 'TODO_STATUS_META',
	'SESSION_TAB_ANIM_MS',
];

function protectStrings(code) {
	const store = [];
	const protectedCode = code.replace(/'(?:\\.|[^'\\])*'/g, (m) => {
		const token = `__STR${store.length}__`;
		store.push(m);
		return token;
	});
	return { protectedCode, store };
}

function restoreStrings(code, store) {
	let s = code;
	for (let i = 0; i < store.length; i++) {
		s = s.replaceAll(`__STR${i}__`, store[i]);
	}
	return s;
}

/** Rewrite bare identifiers to D.dom / D.state / D.const / fn / D.vscode (not inside strings). */
function rewriteIds(code) {
	const { protectedCode, store } = protectStrings(code);
	const sortedFns = [...ALL_FN].sort((a, b) => b.length - a.length);
	const sortedDom = [...DOM_IDS].sort((a, b) => b.length - a.length);
	const sortedState = [...STATE_VARS].sort((a, b) => b.length - a.length);
	const sortedConst = [...CONST_NAMES].sort((a, b) => b.length - a.length);

	let s = protectedCode.replace(/\tvscode\./g, '\tD.vscode.');
	s = s.replace(/([^\w.])vscode\./g, '$1D.vscode.');

	for (const fn of sortedFns) {
		s = s.replace(new RegExp(`\\.\\.\\.\\s*${fn}\\b\\s*\\(`, 'g'), `...fn.${fn}(`);
		s = s.replace(new RegExp(`(?<![.\\w])${fn}\\b(?=\\s*\\()`, 'g'), `fn.${fn}`);
		s = s.replace(new RegExp(`(?<![.\\w])${fn}\\b(?!\\s*\\()`, 'g'), `fn.${fn}`);
	}
	for (const id of sortedDom) {
		s = s.replace(new RegExp(`(?<![.\\w])${id}\\.`, 'g'), `D.dom.${id}.`);
		s = s.replace(new RegExp(`(?<![.\\w])${id}(?![.\\w])`, 'g'), `D.dom.${id}`);
	}
	for (const v of sortedState) {
		s = s.replace(new RegExp(`(?<![.\\w])${v}\\.`, 'g'), `D.state.${v}.`);
	}
	for (const v of sortedState) {
		s = s.replace(new RegExp(`(?<![.\\w])${v}(?![.\\w:])`, 'g'), `D.state.${v}`);
	}
	for (const c of sortedConst) {
		s = s.replace(new RegExp(`(?<![.\\w])${c}\\.`, 'g'), `D.const.${c}.`);
		s = s.replace(new RegExp(`(?<![.\\w])${c}(?![.\\w])`, 'g'), `D.const.${c}`);
	}
	s = s.replaceAll('D.dom.D.dom.', 'D.dom.');
	s = s.replaceAll('D.state.D.state.', 'D.state.');
	s = s.replaceAll('D.const.D.const.', 'D.const.');
	s = s.replaceAll('fn.fn.', 'fn.');
	s = s.replaceAll('D.D.vscode.', 'D.vscode.');
	return restoreStrings(s, store);
}

function transformPreamble(code) {
	let s = code;
	s = s.replace(/\tconst vscode = acquireVsCodeApi\(\);/, '\tD.vscode = acquireVsCodeApi();');
	for (const id of DOM_IDS) {
		s = s.replaceAll(`\tconst ${id} =`, `\tD.dom.${id} =`);
	}
	for (const v of STATE_VARS) {
		s = s.replaceAll(`\tlet ${v} =`, `\tD.state.${v} =`);
	}
	s = s.replaceAll('\tconst pasteCandidates =', '\tD.state.pasteCandidates =');
	s = s.replaceAll('\tconst toolBlocks =', '\tD.state.toolBlocks =');
	for (const c of CONST_NAMES) {
		s = s.replaceAll(`\tconst ${c} =`, `\tD.const.${c} =`);
	}
	s = s.replaceAll('promptEl.', 'D.dom.promptEl.');
	s = s.replaceAll('!promptEl)', '!D.dom.promptEl)');
	s = s.replace(/\tinitAgentVignettes\(\);\n?/g, '');
	s = rewriteIds(s);
	return s;
}

function toFnAssignment(name, body) {
	let s = body;
	if (s.match(/^\tasync function /)) {
		s = s.replace(/^\tasync function \w+/, `\tfn.${name} = async function`);
	} else {
		s = s.replace(/^\tfunction \w+/, `\tfn.${name} = function`);
	}
	return rewriteIds(s);
}

function isJsDocOrEmpty(line) {
	const t = line.trim();
	if (!t) {
		return true;
	}
	return (
		t.startsWith('/**') ||
		t.startsWith('*') ||
		t.startsWith('*/') ||
		(t.startsWith('//') && t.includes('@'))
	);
}

function constBlockEndLine(lines, startLine) {
	if (lines[startLine].trimEnd().endsWith(';')) {
		return startLine + 1;
	}
	let depth = 0;
	for (let i = startLine; i < lines.length; i++) {
		for (const c of lines[i]) {
			if (c === '{' || c === '[') {
				depth++;
			} else if (c === '}' || c === ']') {
				depth--;
			}
		}
		if (depth === 0 && i > startLine) {
			return i + 1;
		}
	}
	throw new Error(`Unclosed const at line ${startLine + 1}`);
}

/** Find function body end; default-arg `= {}` must not end the scan early. */
function functionEndLine(lines, startLine) {
	const decl = lines[startLine];
	const open = decl.lastIndexOf('{');
	if (open < 0) {
		throw new Error(`No opening brace on line ${startLine + 1}`);
	}
	let depth = 1;
	for (let i = startLine; i < lines.length; i++) {
		const line = lines[i];
		const from = i === startLine ? open + 1 : 0;
		for (let c = from; c < line.length; c++) {
			if (line[c] === '{') {
				depth++;
			} else if (line[c] === '}') {
				depth--;
				if (depth === 0) {
					return i + 1;
				}
			}
		}
	}
	throw new Error(`Unclosed function starting at ${startLine + 1}`);
}

function parseInner(inner) {
	const lines = inner.split('\n');
	const fnRe = /^\t(async )?function (\w+)\s*\(/;
	const fnRanges = [];
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(fnRe);
		if (m) {
			const end = functionEndLine(lines, i);
			fnRanges.push({ start: i, end, name: m[2] });
			i = end - 1;
		}
	}
	const functions = fnRanges.map((r) => ({
		name: r.name,
		body: lines.slice(r.start, r.end).join('\n'),
	}));
	const bootstrapStart = lines.findIndex((l) => l.startsWith('\tsendBtn.addEventListener'));
	if (bootstrapStart < 0) {
		throw new Error('bootstrap start not found');
	}
	const chromeStart = fnRanges.find((r) => r.name === 'randomId')?.start ?? bootstrapStart;
	const fnLineSet = new Set();
	for (const r of fnRanges) {
		for (let i = r.start; i < r.end; i++) {
			fnLineSet.add(i);
		}
	}
	const preambleLines = [];
	const wireLines = [];
	for (let i = 0; i < bootstrapStart; i++) {
		if (fnLineSet.has(i)) {
			continue;
		}
		if (/^\tconst \w+ =/.test(lines[i])) {
			const end = constBlockEndLine(lines, i);
			for (let j = i; j < end; j++) {
				preambleLines.push(lines[j]);
			}
			i = end - 1;
			continue;
		}
		if (i < chromeStart) {
			if (!isJsDocOrEmpty(lines[i])) {
				preambleLines.push(lines[i]);
			}
		} else if (!isJsDocOrEmpty(lines[i])) {
			wireLines.push(lines[i]);
		}
	}
	return {
		preamble: preambleLines.join('\n'),
		wire: wireLines.join('\n'),
		functions,
		bootstrap: lines.slice(bootstrapStart).join('\n'),
		bootstrapStart,
	};
}

const source = fs.readFileSync(bakPath, 'utf8');

if (!fs.existsSync(bakPath)) {
	fs.copyFileSync(source, bakPath);
}

const fileLines = source.split(/\r?\n/);
const innerLines = fileLines.slice(3, fileLines.length - 2);
const inner = innerLines.join('\n');
const { preamble, wire, functions, bootstrap, bootstrapStart } = parseInner(inner);

/** End line index (exclusive) of `window.addEventListener('message', …)` block. */
function messageListenerEndLine(lines, startLine) {
	const decl = lines[startLine];
	const open = decl.lastIndexOf('{');
	if (open < 0) {
		throw new Error(`message listener: no brace on line ${startLine + 1}`);
	}
	let depth = 1;
	for (let i = startLine; i < lines.length; i++) {
		const line = lines[i];
		const from = i === startLine ? open + 1 : 0;
		for (let c = from; c < line.length; c++) {
			if (line[c] === '{') {
				depth++;
			} else if (line[c] === '}') {
				depth--;
				if (depth === 0) {
					return i + 1;
				}
			}
		}
	}
	throw new Error('message listener: unclosed block');
}

let bootstrapRest = bootstrap;
let hostSwitch = '';
const hostLineIdx = innerLines.findIndex((l) => l.includes("window.addEventListener('message'"));
if (hostLineIdx >= 0) {
	const hostEnd = messageListenerEndLine(innerLines, hostLineIdx);
	const hostLines = innerLines.slice(hostLineIdx, hostEnd);
	const hostInner = hostLines
		.slice(1, -1)
		.join('\n')
		.replace(/^\t\tconst m = event\.data;\n?/, '')
		.replace(/^\t\t/, '\t');
	hostSwitch = `\tfn.handleHostMessage = function (m) {\n${hostInner}\n\t};`;
	const withoutHost = [...innerLines.slice(0, hostLineIdx), ...innerLines.slice(hostEnd)];
	bootstrapRest = withoutHost.slice(bootstrapStart).join('\n');
}

const moduleBodies = Object.fromEntries(MODULE_ORDER.map((f) => [f, []]));

for (const { name, body } of functions) {
	const mod = FN_MODULE[name];
	if (!mod) {
		throw new Error(`Function not mapped to module: ${name}`);
	}
	moduleBodies[mod].push(toFnAssignment(name, body));
}

if (hostSwitch) {
	moduleBodies['09-host.js'].push(rewriteIds(hostSwitch));
}
const messageListenerStub =
	"\twindow.addEventListener('message', (event) => {\n\t\tfn.handleHostMessage(event.data);\n\t});";
const initTailMarker = '\tupdateComposerChrome();';
let bootstrapListeners = bootstrapRest;
let bootstrapInit = '';
const initIdx = bootstrapRest.lastIndexOf(initTailMarker);
if (initIdx >= 0) {
	bootstrapListeners = bootstrapRest.slice(0, initIdx);
	bootstrapInit = bootstrapRest.slice(initIdx);
}
moduleBodies['10-bootstrap.js'].push(rewriteIds(wire));
moduleBodies['10-bootstrap.js'].push(rewriteIds(bootstrapListeners));
if (hostSwitch) {
	moduleBodies['10-bootstrap.js'].push(rewriteIds(messageListenerStub));
}
moduleBodies['10-bootstrap.js'].push(rewriteIds('\tfn.initAgentVignettes();\n'));
moduleBodies['10-bootstrap.js'].push(rewriteIds(bootstrapInit));

fs.mkdirSync(outDir, { recursive: true });

const contextFile =
	header +
	'(function (global) {\n' +
	'\tconst D = global.DroxChat || (global.DroxChat = { dom: {}, state: {}, const: {}, fn: {} });\n' +
	transformPreamble(preamble) +
	'\n})(typeof globalThis !== "undefined" ? globalThis : window);\n';
fs.writeFileSync(path.join(outDir, '00-context.js'), contextFile);

for (const file of MODULE_ORDER.slice(1)) {
	const body = moduleBodies[file].join('\n\n');
	const out =
		header +
		'(function (D) {\n' +
		'\tconst fn = D.fn;\n' +
		body +
		'\n})(globalThis.DroxChat);\n';
	fs.writeFileSync(path.join(outDir, file), out);
}

fs.writeFileSync(
	srcPath,
	header + '// Entry: scripts load DROX_CHAT_SCRIPT_FILES from droxChatWebview.ts\n',
);

for (const file of MODULE_ORDER) {
	const p = path.join(outDir, file);
	execSync(`node --check "${p}"`, { stdio: 'pipe' });
	const n = fs.readFileSync(p, 'utf8').split('\n').length;
	console.log(`  OK ${file} (${n} lines)`);
}
console.log('All modules valid.');
