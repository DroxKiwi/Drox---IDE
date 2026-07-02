/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { join } from '../../../../../base/common/path.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MarkerSeverity } from '../../../../../platform/markers/common/markers.js';
import { isDroxWebviewToHostMessage } from '../../browser/droxChatBridge.js';
import { droxLlmModelEnumValues, updateDroxLlmModelEnum } from '../../common/droxConfiguration.js';
import { parseDroxEnvFileContent } from '../../common/droxEnvFile.js';
import { formatDroxEngineTraceExport } from '../../common/chat/droxEngineTraceExport.js';
import { formatDroxTranscriptExport } from '../../common/chat/droxTranscriptExport.js';
import { formatDroxCombinedSessionExport, formatDroxUiReplayExport } from '../../common/chat/droxUiReplayExport.js';
import {
	buildLlmModelListUrl,
	normalizeLlmServerBaseUrl,
	parseLlmProvider,
	resolveLlmServerUrl,
	resolveOllamaServerUrl,
} from '../../common/droxLlmCatalog.js';
import { DroxClientToolRegistry } from '../../common/droxClientTools.js';
import { applyEdits, validateFileEditScope } from '../../common/droxFileEdit.js';
import { decodeDataUrl } from '../../common/droxAttachments.js';
import { normalizeFileEditToolInput, normalizeFileWriteToolInput } from '../../common/droxToolInputNormalize.js';
import { isVisionRelatedLlmError, modelLikelySupportsVision, normalizeImageBase64Payload } from '../../common/droxVision.js';
import {
	inferFileToolName,
	isFileMutationToolName,
	normalizeToolFinishOutput,
	takePendingForFileFinish,
	toolArgPath,
	toolOutputIndicatesApplied,
} from '../../common/droxFileMutation.js';
import {
	formatDiagnosticForComposer,
	payloadFromMarker,
} from '../../common/droxDiagnosticToChat.js';
import {
	isPermissionToolAsk,
	normalizeDroxPermissionMode,
	resolveDroxPermissionMode,
	shouldAutoAllowPermissionAsk,
} from '../../common/droxPermissionAsk.js';
import {
	applyNotebookCellEdits,
	normalizeNotebookEditInput,
} from '../../common/droxNotebookEdit.js';
import {
	buildFileChangePayload,
	buildProposedFileChangeFromToolArgs,
	countDiffLines,
	enrichFileChangePayload,
	resolveFileChangePayload,
} from '../../common/droxFileChange.js';
import { isListableDroxSessionId } from '../../common/droxSession.js';
import { resetDroxWorkspaceOnDisk } from '../../common/droxWorkspaceResetFs.js';
import { normalizeWindowsFsPath } from '../../common/droxPathUtil.js';
import { parsePartialPath } from '../../common/droxPromptCompletion.js';
import {
	droxResourcePlatformFolder,
	enumerateDroxExecutableCandidates,
	isBareDroxExecutableName,
} from '../../common/droxExecutable.js';
import { enumerateDroxMcpRegistryCandidates } from '../../common/droxMcpRegistry.js';
import { isUnderDroxAgentOutputPath } from '../../common/droxWorkspacePaths.js';
import { parseUserAskParams } from '../../common/droxUserAsk.js';
import { extractTodosFromToolOutput, isTodoWriteOutput } from '../../common/droxTodoExtract.js';
import { toUserMessagePasteWire } from '../../common/droxPasteCandidates.js';
import { referenceDisplayLabel, toUserMessageReferenceWire } from '../../common/droxReferences.js';
import {
	deriveSessionTabTitle,
	pickActiveUserPromptStickyIndex,
	truncateUserPromptStickyText,
} from '../../common/droxUserPromptSticky.js';
import {
	truncateUserPromptForEngine,
	USER_PROMPT_ENGINE_KEEP_LINES,
	USER_PROMPT_ENGINE_MAX_LINES,
} from '../../common/droxUserPromptEngine.js';
import { IDroxTranscriptMessage } from '../../common/droxSession.js';
import { replayTranscriptMessageRich } from '../../browser/droxSessionReplay.js';
import { DroxHostToWebviewMessage } from '../../browser/droxChatBridge.js';
import { IDroxChatAgentEventHost } from '../../browser/droxChatAgentEvents.js';
import { buildAgentRunParams, effectiveMaxTokensForRun, IDroxLlmSettings, llmSettingsToEnv } from '../../common/droxRunSettings.js';
import { DroxRunRevertService } from '../../electron-browser/droxRunRevertService.js';

function mockLlmSettings(overrides: Partial<IDroxLlmSettings> = {}): IDroxLlmSettings {
	return {
		server: '',
		model: 'test-model',
		apiKey: '',
		llmHeaders: {},
		llmProvider: 'ollama',
		primaryLanguage: 'fr',
		maxIterations: 50,
		temperature: undefined,
		maxTokens: undefined,
		numPredict: undefined,
		numCtx: undefined,
		topP: undefined,
		topK: undefined,
		repeatPenalty: undefined,
		seed: undefined,
		minP: undefined,
		presencePenalty: undefined,
		frequencyPenalty: undefined,
		keepAlive: '',
		nativeThinking: false,
		...overrides,
	};
}

const WS = process.platform === 'win32'
	? 'C:\\ws\\project'
	: '/ws/project';

suite('Drox — executable packaging folder', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('droxResourcePlatformFolder matches host', () => {
		const folder = droxResourcePlatformFolder();
		if (process.platform === 'win32') {
			assert.ok(folder === 'win32-x64' || folder === 'win32-arm64');
		} else if (process.platform === 'darwin') {
			assert.ok(folder === 'darwin-x64' || folder === 'darwin-arm64');
		} else if (process.platform === 'linux') {
			assert.ok(
				folder === 'linux-x64'
				|| folder === 'linux-arm64'
				|| folder === 'linux-armhf',
			);
		}
	});

	test('isBareDroxExecutableName treats bare command as auto-resolve', () => {
		assert.ok(isBareDroxExecutableName('drox'));
		assert.ok(isBareDroxExecutableName('drox.exe'));
		assert.ok(isBareDroxExecutableName('  Drox.EXE  '));
		assert.ok(!isBareDroxExecutableName(''));
		assert.ok(!isBareDroxExecutableName('C:\\Drox\\resources\\drox\\win32-x64\\drox.exe'));
	});

	test('enumerateDroxExecutableCandidates prefers workspace cargo build over installDir', () => {
		const folder = droxResourcePlatformFolder();
		if (!folder) {
			return;
		}
		const bin = process.platform === 'win32' ? 'drox.exe' : 'drox';
		const list = enumerateDroxExecutableCandidates({
			configuredPath: '',
			workspaceFolderPaths: ['/ws'],
			installDir: '/DroxIDE',
			appRoot: '/DroxIDE/resources/app',
		});
		assert.ok(list.length > 0);
		assert.ok(list[0].replace(/\\/g, '/').endsWith(`/ws/drox-engine/drox/target/debug/${bin}`));
		const installIdx = list.findIndex(p => p.replace(/\\/g, '/').endsWith(`/resources/drox/${folder}/${bin}`));
		const wsIdx = list.findIndex(p => p.includes('/ws/drox-engine/drox/target/debug/'));
		assert.ok(wsIdx >= 0 && installIdx > wsIdx);
	});

	test('enumerateDroxExecutableCandidates prefers appRoot cargo over bundled resources (external workspace)', () => {
		const folder = droxResourcePlatformFolder();
		if (!folder) {
			return;
		}
		const bin = process.platform === 'win32' ? 'drox.exe' : 'drox';
		const list = enumerateDroxExecutableCandidates({
			configuredPath: '',
			workspaceFolderPaths: ['/site-kdds'],
			appRoot: '/DroxIDE/resources/app',
		});
		const cargoIdx = list.findIndex(p => p.replace(/\\/g, '/').endsWith(`/drox-engine/drox/target/debug/${bin}`));
		const bundledIdx = list.findIndex(p => p.replace(/\\/g, '/').includes(`/resources/drox/${folder}/${bin}`));
		assert.ok(cargoIdx >= 0, 'appRoot cargo debug candidate');
		assert.ok(bundledIdx >= 0, 'bundled candidate');
		assert.ok(cargoIdx < bundledIdx, 'cargo must be probed before bundled snapshot');
	});

	test('enumerateDroxMcpRegistryCandidates probes workspace and packaged app paths', () => {
		const list = enumerateDroxMcpRegistryCandidates({
			workspaceFolderPaths: ['/ws'],
			appRoot: '/DroxIDE/resources/app',
			installDir: '/DroxIDE',
		});
		assert.ok(list.some(p => p.replace(/\\/g, '/').endsWith('/ws/drox-engine/mcp-registry')));
		assert.ok(list.some(p => p.replace(/\\/g, '/').endsWith('/DroxIDE/resources/app/drox-engine/mcp-registry')));
	});
});

suite('Drox — file mutation helpers', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('isFileMutationToolName', () => {
		assert.ok(isFileMutationToolName('file_edit'));
		assert.ok(isFileMutationToolName('notebook_edit'));
		assert.ok(!isFileMutationToolName('bash'));
	});

	test('normalizeToolFinishOutput parses JSON string', () => {
		const out = normalizeToolFinishOutput('{"applied":true,"path":"./a.ts"}');
		assert.strictEqual(out?.applied, true);
		assert.strictEqual(out?.path, './a.ts');
	});

	test('toolOutputIndicatesApplied for file_edit', () => {
		assert.ok(toolOutputIndicatesApplied('file_edit', { edits_applied: 2 }));
		assert.ok(!toolOutputIndicatesApplied('file_edit', { error: 'x' }));
	});

	test('inferFileToolName from output shape', () => {
		assert.strictEqual(
			inferFileToolName({ cell_edits_applied: 1 }),
			'notebook_edit',
		);
		assert.strictEqual(inferFileToolName({ bytes_written: 10 }), 'file_write');
	});

	test('takePendingForFileFinish matches by output path when ids differ', () => {
		const pending = new Map<string, { name: string; args: unknown }>();
		pending.set('start_id', {
			name: 'file_edit',
			args: { path: 'src/foo.ts', edits: [] },
		});
		const got = takePendingForFileFinish(pending, 'other_id', {
			applied: true,
			path: '/ws/src/foo.ts',
			edits_applied: 1,
			diff: '+line',
		});
		assert.strictEqual(got?.name, 'file_edit');
		assert.strictEqual(pending.size, 0);
	});
});

suite('Drox — file change diff', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('countDiffLines ignores headers', () => {
		const d = '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new\n';
		assert.deepStrictEqual(countDiffLines(d), { added: 1, removed: 1 });
	});

	test('enrichFileChangePayload builds unified diff for file_write without engine diff', () => {
		const base = buildFileChangePayload(
			'/ws',
			'file_write',
			{ applied: true, path: '/ws/src/new.ts', bytes_written: 11 },
			{ path: 'src/new.ts', content: 'hello\nworld' },
			{ applied: true },
		);
		assert.ok(base);
		const enriched = enrichFileChangePayload(base!, '', 'hello\nworld');
		assert.ok(enriched.diff.includes('+hello'));
		assert.ok(enriched.diff.includes('+world'));
		assert.strictEqual(enriched.op, 'write');
		assert.ok(enriched.added >= 2);
	});

	test('resolveFileChangePayload reads disk when args and diff are missing', async () => {
		const payload = await resolveFileChangePayload(
			'/ws',
			'file_write',
			{ applied: true, path: '/ws/src/new.ts', bytes_written: 5 },
			undefined,
			{ applied: true },
			async () => 'alpha',
			'',
		);
		assert.ok(payload);
		assert.ok(payload!.diff.includes('+alpha'));
		assert.strictEqual(payload!.op, 'write');
	});

	test('toolArgPath parses JSON string arguments', () => {
		assert.strictEqual(
			toolArgPath('{"path":"src/foo.ts","content":"x"}'),
			'src/foo.ts',
		);
	});

	test('buildProposedFileChangeFromToolArgs previews file_write before disk', async () => {
		const proposed = await buildProposedFileChangeFromToolArgs(
			'C:/ws',
			'file_write',
			{ path: 'src/new.ts', content: 'hello\nworld' },
		);
		assert.ok(proposed);
		assert.strictEqual(proposed!.applied, false);
		assert.strictEqual(proposed!.proposed, true);
		assert.ok(proposed!.diff.includes('+hello'));
		assert.strictEqual(proposed!.relPath, 'src/new.ts');
	});

	test('buildProposedFileChangeFromToolArgs previews file_edit from args', async () => {
		const proposed = await buildProposedFileChangeFromToolArgs(
			'C:/ws',
			'file_edit',
			{
				path: 'src/a.ts',
				edits: [{ old_string: 'foo', new_string: 'bar' }],
			},
			async () => 'const foo = 1;',
		);
		assert.ok(proposed);
		assert.strictEqual(proposed!.proposed, true);
		assert.ok(proposed!.diff.length > 0);
		assert.ok(proposed!.added >= 1);
	});
});

suite('Drox — Windows fs path normalization', () => {
	test('strips extended-length and corrupted ? prefixes', () => {
		assert.strictEqual(
			normalizeWindowsFsPath('\\\\?\\C:\\Users\\coren\\project\\file.tsx'),
			'C:\\Users\\coren\\project\\file.tsx',
		);
		assert.strictEqual(
			normalizeWindowsFsPath('?\\C:\\Users\\coren\\project\\file.tsx'),
			'C:\\Users\\coren\\project\\file.tsx',
		);
		assert.strictEqual(
			normalizeWindowsFsPath('?C:\\Users\\coren\\project\\file.tsx'),
			'C:\\Users\\coren\\project\\file.tsx',
		);
	});
});

suite('Drox — vision / images', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('decodeDataUrl accepts charset in meta', () => {
		const decoded = decodeDataUrl('data:image/png;charset=utf-8;base64,QQ==');
		assert.ok(decoded);
		assert.strictEqual(decoded!.mime, 'image/png');
	});

	test('normalizeImageBase64Payload strips data URL prefix', () => {
		assert.strictEqual(normalizeImageBase64Payload('data:image/png;base64,QQ=='), 'QQ==');
	});

	test('modelLikelySupportsVision detects llava', () => {
		assert.strictEqual(modelLikelySupportsVision('llava:13b'), true);
	});

	test('isVisionRelatedLlmError', () => {
		assert.ok(isVisionRelatedLlmError('model does not support images'));
	});
});

suite('Drox — tool input normalize', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizeFileEditToolInput wraps root old/new into edits', () => {
		const out = normalizeFileEditToolInput({
			path: 'src/foo.ts',
			old_string: 'a',
			new_string: 'b',
		}) as { path: string; edits: { old_string: string; new_string: string }[] };
		assert.strictEqual(out.path, 'src/foo.ts');
		assert.strictEqual(out.edits.length, 1);
		assert.strictEqual(out.edits[0]!.old_string, 'a');
	});

	test('normalizeFileEditToolInput coerces single edit object', () => {
		const out = normalizeFileEditToolInput({
			file_path: 'theme.tsx',
			edit: { old: 'foo', new: 'bar' },
		}) as { path: string; edits: { old_string: string; new_string: string }[] };
		assert.strictEqual(out.path, 'theme.tsx');
		assert.strictEqual(out.edits[0]!.old_string, 'foo');
	});

	test('normalizeFileEditToolInput accepts op/replace aliases and nested path', () => {
		const out = normalizeFileEditToolInput({
			edits: [{
				op: 'replace',
				path: 'src/home.tsx',
				search: 'gradient',
				replace: 'AnimatedBackground',
			}],
		}) as { path: string; edits: { old_string: string; new_string: string }[] };
		assert.strictEqual(out.path, 'src/home.tsx');
		assert.strictEqual(out.edits.length, 1);
		assert.strictEqual(out.edits[0]!.old_string, 'gradient');
		assert.strictEqual(out.edits[0]!.new_string, 'AnimatedBackground');
	});

	test('normalizeFileWriteToolInput accepts aliases', () => {
		const out = normalizeFileWriteToolInput({
			file_path: 'lib/new.ts',
			body: 'export {}',
		}) as { path: string; content: string };
		assert.strictEqual(out.path, 'lib/new.ts');
		assert.strictEqual(out.content, 'export {}');
	});
});

suite('Drox — file_edit applyEdits', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('single replace', () => {
		const r = applyEdits('hello world', [{ old_string: 'world', new_string: 'drox' }]);
		assert.strictEqual(r, 'hello drox');
	});

	test('replace_all', () => {
		const r = applyEdits('aa bb aa', [
			{ old_string: 'aa', new_string: 'x', replace_all: true },
		]);
		assert.strictEqual(r, 'x bb x');
	});
});

suite('Drox — file_edit scope guard (L-014)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const big = 'line one\n'.repeat(20) + 'line tail\n';

	test('allows small targeted hunks', () => {
		assert.strictEqual(
			validateFileEditScope(big, [{ old_string: 'line one\n', new_string: 'line TWO\n' }]),
			undefined,
		);
	});

	test('rejects hunk covering most of the file', () => {
		const err = validateFileEditScope(big, [{ old_string: big.trim(), new_string: 'all new' }]);
		assert.ok(err?.includes('almost the entire file'));
	});

	test('rejects replace_all on large file', () => {
		const err = validateFileEditScope(big, [
			{ old_string: 'line', new_string: 'LINE', replace_all: true },
		]);
		assert.ok(err?.includes('replace_all'));
	});
});

suite('Drox — notebook_edit', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizeNotebookEditInput shortcut new_source', () => {
		const input = normalizeNotebookEditInput({
			path: 'nb.ipynb',
			cell_index: 0,
			new_source: 'print(1)',
		});
		assert.strictEqual(input.path, 'nb.ipynb');
		assert.strictEqual(input.edits.length, 1);
		assert.strictEqual(input.edits[0]!.new_string, 'print(1)');
	});

	test('applyNotebookCellEdits replace source', () => {
		const cells: unknown[] = [
			{ cell_type: 'code', source: 'old\n', metadata: {}, outputs: [], execution_count: 1 },
		];
		applyNotebookCellEdits(cells, [{
			cell_index: 0,
			old_string: 'old',
			new_string: 'new',
		}]);
		assert.strictEqual((cells[0] as { source: string }).source, 'new\n');
		assert.strictEqual((cells[0] as { execution_count: null }).execution_count, null);
	});
});

suite('Drox — prompt completion parsePartialPath', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty partial → workspace root', () => {
		const { directory, prefix } = parsePartialPath('', WS);
		assert.strictEqual(directory.replace(/\\/g, '/'), WS.replace(/\\/g, '/'));
		assert.strictEqual(prefix, '');
	});

	test('prefix filter at root', () => {
		const { prefix } = parsePartialPath('src', WS);
		assert.strictEqual(prefix, 'src');
	});

	test('directory trailing slash', () => {
		const { prefix } = parsePartialPath('src/', WS);
		assert.strictEqual(prefix, '');
	});
});

suite('Drox — diagnostics → chat', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('isPermissionToolAsk rejects blocking ask', () => {
		const blocking = parseUserAskParams({
			askId: 'a1',
			questions: [{
				id: 'q1',
				prompt: 'Which option?',
				options: [{ id: 'opt1', label: 'A' }],
				allowFreeText: true,
			}],
		});
		assert.ok(!('error' in blocking));
		if ('error' in blocking) {
			return;
		}
		assert.ok(!isPermissionToolAsk(blocking));
	});

	test('parseUserAskParams unwraps stringified questions JSON array', () => {
		const parsed = parseUserAskParams({
			askId: 'a1',
			questions: JSON.stringify([
				{ id: 'q1', prompt: 'First?', options: [{ id: 'a', label: 'A' }] },
				{ id: 'q2', prompt: 'Second?', allowFreeText: true, options: [] },
			]),
		});
		assert.ok(!('error' in parsed));
		if ('error' in parsed) {
			return;
		}
		assert.strictEqual(parsed.questions.length, 2);
		assert.strictEqual(parsed.questions[0].id, 'q1');
		assert.strictEqual(parsed.questions[1].id, 'q2');
	});

	test('shouldAutoAllowPermissionAsk for trustEdit only', () => {
		assert.ok(shouldAutoAllowPermissionAsk('trustEdit'));
		assert.ok(shouldAutoAllowPermissionAsk('acceptEdits'));
		assert.ok(!shouldAutoAllowPermissionAsk('analyze'));
		assert.ok(!shouldAutoAllowPermissionAsk('imNotCrazy'));
		assert.ok(!shouldAutoAllowPermissionAsk(undefined));
	});

	test('normalizeDroxPermissionMode downgrades removed professor mode', () => {
		assert.strictEqual(normalizeDroxPermissionMode('professor'), 'imNotCrazy');
		assert.strictEqual(normalizeDroxPermissionMode('Professor'), 'imNotCrazy');
	});

	test('resolveDroxPermissionMode flags professor downgrade', () => {
		const resolved = resolveDroxPermissionMode('professor');
		assert.strictEqual(resolved.mode, 'imNotCrazy');
		assert.strictEqual(resolved.downgradedFromProfessor, true);
		assert.strictEqual(resolveDroxPermissionMode('trustEdit').downgradedFromProfessor, false);
	});

	test('buildAgentRunParams never sends professor wire mode', () => {
		const params = buildAgentRunParams({
			prompt: 'hi',
			workspace: WS,
			mode: 'professor',
			sessionId: 'ses_test',
			settings: mockLlmSettings(),
			disabledTools: [],
			mcpToolsEnabled: true,
		});
		assert.strictEqual(params.mode, 'imNotCrazy');
		assert.notStrictEqual(params.mode, 'professor');
	});

	test('isPermissionToolAsk detects engine permission ask', () => {
		const perm = parseUserAskParams({
			askId: 'p1',
			questions: [{
				id: 'q1',
				prompt: 'Rule matched.\n\nAllow this `bash` call?\nArgs:\n{}',
				options: [{ id: 'opt1', label: 'yes' }, { id: 'opt2', label: 'no' }],
			}],
		});
		assert.ok(!('error' in perm));
		if ('error' in perm) {
			return;
		}
		assert.ok(isPermissionToolAsk(perm));
	});

	test('formatDiagnosticForComposer', () => {
		const uri = URI.file(`${WS}/src/foo.ts`);
		const text = formatDiagnosticForComposer(uri, {
			uri: uri.toString(),
			startLine: 4,
			startCharacter: 2,
			endLine: 4,
			endCharacter: 5,
			message: 'Type error',
			severity: MarkerSeverity.Error,
			code: 'TS2322',
		}, WS);
		assert.ok(text.includes('Type error'));
		assert.ok(text.includes('TS2322'));
		assert.ok(text.includes('foo.ts'));
	});

	test('payloadFromMarker uses 0-based lines in payload', () => {
		const payload = payloadFromMarker({
			resource: URI.file(`${WS}/x.ts`),
			owner: 'test',
			severity: MarkerSeverity.Warning,
			message: 'warn',
			startLineNumber: 10,
			startColumn: 3,
			endLineNumber: 10,
			endColumn: 8,
		});
		assert.strictEqual(payload.startLine, 9);
		assert.strictEqual(payload.startCharacter, 2);
	});
});

suite('Drox — webview bridge', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('isDroxWebviewToHostMessage validates send', () => {
		assert.ok(isDroxWebviewToHostMessage({
			type: 'send',
			prompt: 'hi',
			mode: 'default',
		}));
		assert.ok(!isDroxWebviewToHostMessage({ type: 'send', prompt: 1, mode: 'default' }));
	});

	test('pathComplete requires requestId and query', () => {
		assert.ok(isDroxWebviewToHostMessage({
			type: 'pathComplete',
			requestId: 'pc_1',
			query: 'src',
		}));
	});
});

suite('Drox — client tool registry (smoke RPC handler)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('tool/exec dispatches registered handler', async () => {
		const registry = new DroxClientToolRegistry();
		registry.register('echo', async p => ({
			output: { echo: p.toolName, workspace: p.workspace },
		}));
		const handler = registry.toRequestHandler(() => 'run1');
		const result = await handler({
			toolName: 'echo',
			runId: 'run1',
			callId: 'c1',
			workspace: WS,
			input: {},
		});
		assert.ok('result' in result);
		const out = (result as { result: { output: { echo: string } } }).result.output;
		assert.strictEqual(out.echo, 'echo');
	});

	test('tool/exec unknown tool returns client error', async () => {
		const registry = new DroxClientToolRegistry();
		const handler = registry.toRequestHandler(() => 'r');
		const result = await handler({
			toolName: 'missing_tool',
			runId: 'r',
			callId: 'c',
			workspace: WS,
			input: {},
		});
		assert.ok('result' in result);
		const r = result as { result: { isError: boolean; output: { error: string } } };
		assert.strictEqual(r.result.isError, true);
		assert.ok(r.result.output.error.includes('missing_tool'));
	});

	test('tool/exec rejects stale runId after cancel', async () => {
		const registry = new DroxClientToolRegistry();
		registry.register('echo', async () => ({ output: { ok: true } }));
		const handler = registry.toRequestHandler(() => 'run_active');
		const result = await handler({
			toolName: 'echo',
			runId: 'run_old',
			callId: 'c1',
			workspace: WS,
			input: {},
		});
		assert.ok('result' in result);
		const r = result as { result: { isError: boolean; output: { error: string } } };
		assert.strictEqual(r.result.isError, true);
		assert.ok(r.result.output.error.includes('stale run id') || r.result.output.error.includes('no active'));
	});
});

suite('Drox — todo_write extract', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('isTodoWriteOutput detects todos array', () => {
		assert.strictEqual(isTodoWriteOutput({ todos: [] }), true);
		assert.strictEqual(isTodoWriteOutput({ steps: [] }), false);
	});

	test('extractTodosFromToolOutput normalizes items', () => {
		const todos = extractTodosFromToolOutput({
			todos: [
				{ id: '1', content: 'Phase 0', status: 'in_progress' },
				{ id: '2', content: 'Phase 1', status: 'pending' },
			],
			counts: { pending: 1, in_progress: 1, completed: 0, cancelled: 0 },
		});
		assert.ok(todos);
		assert.strictEqual(todos.length, 2);
		assert.strictEqual(todos[0].status, 'in_progress');
	});
});

suite('Drox — user message wire', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('toUserMessageReferenceWire maps resolved ref', () => {
		const wire = toUserMessageReferenceWire({
			uri: 'file:///ws/a.ts',
			rel: './a.ts',
			abs: `${WS}/a.ts`,
			kind: 'file',
			inWorkspace: true,
		});
		assert.strictEqual(wire.rel, './a.ts');
		assert.strictEqual(wire.kind, 'file');
		assert.strictEqual(wire.label, 'a.ts');
		assert.strictEqual(referenceDisplayLabel('./src/app/page.tsx'), 'app/page.tsx');
	});

	test('toUserMessagePasteWire maps editor paste', () => {
		const wire = toUserMessagePasteWire({
			kind: 'editor',
			absPath: `${WS}/src/x.ts`,
			relPath: 'src/x.ts',
			startLine: 2,
			endLine: 5,
			lineCount: 4,
			text: 'code',
		});
		assert.ok(wire);
		assert.strictEqual(wire.startLine, 2);
		assert.strictEqual(wire.endLine, 5);
	});
});

suite('Drox — user prompt engine truncation (G-CTX-01)', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('truncateUserPromptForEngine keeps short prompts', () => {
		assert.strictEqual(truncateUserPromptForEngine('hello'), 'hello');
	});

	test('truncateUserPromptForEngine caps long stack traces', () => {
		const lines = Array.from({ length: USER_PROMPT_ENGINE_MAX_LINES + 10 }, (_, i) => `line ${i}`);
		const raw = lines.join('\n');
		const out = truncateUserPromptForEngine(raw);
		assert.ok(out.includes('… [truncated'));
		assert.ok(out.split('\n').length < lines.length);
		const head = lines.slice(0, USER_PROMPT_ENGINE_KEEP_LINES).join('\n');
		assert.ok(out.startsWith(head));
	});
});

suite('Drox — chat chrome sticky', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('truncateUserPromptStickyText', () => {
		assert.strictEqual(truncateUserPromptStickyText('  hello   world  '), 'hello world');
		assert.ok(truncateUserPromptStickyText('x'.repeat(200)).endsWith('…'));
	});

	test('deriveSessionTabTitle', () => {
		assert.strictEqual(deriveSessionTabTitle('  Compréhension du code  '), 'Compréhension du code');
		assert.ok(deriveSessionTabTitle('a'.repeat(80)).length <= 36);
	});

	test('pickActiveUserPromptStickyIndex — dernier message en bas', () => {
		assert.strictEqual(pickActiveUserPromptStickyIndex([false]), 0);
		assert.strictEqual(pickActiveUserPromptStickyIndex([false, false, false]), 2);
	});

	test('pickActiveUserPromptStickyIndex — remonte au scroll', () => {
		assert.strictEqual(pickActiveUserPromptStickyIndex([false, false, false]), 2);
		assert.strictEqual(pickActiveUserPromptStickyIndex([true, true, false]), 2);
		assert.strictEqual(pickActiveUserPromptStickyIndex([true, true, true]), 0);
		assert.strictEqual(pickActiveUserPromptStickyIndex([true, false, false]), 2);
	});
});

suite('Drox — transcript replay', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function mockReplayHost(): { host: IDroxChatAgentEventHost; posts: DroxHostToWebviewMessage[]; pending: Map<string, { name: string; args: unknown }> } {
		const posts: DroxHostToWebviewMessage[] = [];
		const pending = new Map<string, { name: string; args: unknown }>();
		const host: IDroxChatAgentEventHost = {
			post: (m) => posts.push(m),
			getCurrentSessionId: () => undefined,
			setTabTitleFromModel: () => { },
			trackUsageForActiveTab: () => { },
			trackContextForActiveTab: () => { },
			getPendingTool: (id) => pending.get(id),
			setPendingTool: (id, entry) => pending.set(id, entry),
			deletePendingTool: (id) => pending.delete(id),
			takePendingToolForFileFinish: (id, output) => takePendingForFileFinish(pending, id, output),
			clearPendingTools: () => pending.clear(),
			handleFileMutationAfterToolFinish: () => { },
			getWorkspaceUri: () => undefined,
			ingestContextChunkSummary: () => { },
		};
		return { host, posts, pending };
	}

	test('replayTranscriptMessageRich — outils en blocs UI, pas [tool] texte', () => {
		const { host, posts } = mockReplayHost();
		const m: IDroxTranscriptMessage = {
			role: 'assistant',
			content: [
				{ type: 'text', text: 'Je lis le fichier.\n' },
				{ type: 'tool_use', id: 'tu_1', name: 'file_read', input: { path: 'README.md' } },
			],
		};
		replayTranscriptMessageRich(host, m);
		assert.ok(posts.some(p => p.kind === 'append' && p.role === 'assistant'));
		assert.ok(posts.some(p => p.kind === 'tool' && p.phase === 'start' && p.name === 'file_read'));
		assert.ok(!posts.some(p => p.kind === 'append' && typeof p.text === 'string' && p.text.includes('[tool]')));
	});

	test('replayTranscriptMessageRich — delegate_executor ignoré (solo UI)', () => {
		const { host, posts } = mockReplayHost();
		replayTranscriptMessageRich(host, {
			role: 'assistant',
			content: [{ type: 'tool_use', id: 'tu_del', name: 'delegate_executor', input: { tasks: [] } }],
		});
		replayTranscriptMessageRich(host, {
			role: 'tool',
			content: [{
				type: 'tool_result',
				tool_use_id: 'tu_del',
				content: JSON.stringify({
					batch: true,
					results: [{ taskId: 't1', status: 'completed', reportMarkdown: 'Done.' }],
				}),
				is_error: false,
			}],
		});
		assert.ok(!posts.some(p => p.kind === 'tool'));
	});

	test('replayTranscriptMessageRich — phases depuis le texte assistant', () => {
		const { host, posts } = mockReplayHost();
		const m: IDroxTranscriptMessage = {
			role: 'assistant',
			content: [
				{ type: 'text', text: '[phase: reading]\nContenu lu.\n[phase: answering]\nRéponse.\n[phase: done]\n' },
			],
		};
		replayTranscriptMessageRich(host, m);
		assert.ok(posts.some(p => p.kind === 'phase' && p.phase === 'reading'));
		assert.ok(posts.some(p => p.kind === 'phase' && p.phase === 'answering'));
		assert.ok(posts.some(p => p.kind === 'phase' && p.close === true));
		assert.ok(posts.some(p => p.kind === 'append' && p.role === 'assistant' && p.text.includes('Réponse')));
	});
});

suite('Drox — transcript export', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('formatDroxUiReplayExport preserves UI event order', () => {
		const journal = [
			{ kind: 'append', role: 'user', text: 'Salut' },
			{ kind: 'gatePath', phase: 'pass', gateId: 'entry', gatePath: 'entry', branch: 'architect_discuss' },
			{ kind: 'orchestrationRole', role: 'architect_discussion' },
			{ kind: 'phase', phase: 'internal_reasoning' },
			{ kind: 'delta', text: 'Salut ! ' },
			{ kind: 'delta', text: 'Comment puis-je vous aider ?' },
			{ kind: 'phase', close: true },
			{ kind: 'userFacingReply', text: 'Bonjour ! Comment puis-je t\'aider aujourd\'hui ?' },
		];
		const text = formatDroxUiReplayExport({
			sessionId: 'ses_ui',
			journal,
			transcriptMessageCount: 2,
		});
		assert.ok(text.includes('UI journal events: 8'));
		assert.ok(text.includes('Step 1 — USER'));
		assert.ok(text.includes('GATE PATH'));
		assert.ok(text.includes('architect_discuss'));
		assert.ok(text.includes('ROLE'));
		assert.ok(text.includes('internal_reasoning'));
		assert.ok(text.includes('THINKING STREAM'));
		assert.ok(text.includes('Salut !'));
		assert.ok(text.includes('USER-FACING REPLY'));
		assert.ok(text.includes('Bonjour !'));
		const userIdx = text.indexOf('Step 1 — USER');
		const gateIdx = text.indexOf('GATE PATH');
		const streamIdx = text.indexOf('THINKING STREAM');
		const replyIdx = text.indexOf('USER-FACING REPLY');
		assert.ok(userIdx < gateIdx && gateIdx < streamIdx && streamIdx < replyIdx);
	});

	test('formatDroxUiReplayExport labels multi-turn user runs', () => {
		const journal = [
			{ kind: 'append', role: 'user', text: 'Fix hero text' },
			{ kind: 'phase', phase: 'done' },
			{ kind: 'append', role: 'user', text: 'Refine background animation' },
		];
		const text = formatDroxUiReplayExport({
			sessionId: 'ses_multi',
			journal,
		});
		assert.ok(text.includes('User runs in session: 2'));
		assert.ok(text.includes('run 1: Fix hero text'));
		assert.ok(text.includes('run 2: Refine background animation'));
		assert.ok(text.includes('Step 1 — USER'));
		assert.ok(text.includes('Step 2 — USER RUN 2'));
		assert.ok(text.includes('tour 2 de 2 dans cette session'));
	});

	test('formatDroxCombinedSessionExport includes raw journal and engine roster', () => {
		const journal = [
			{ kind: 'append', role: 'user', text: 'Hi' },
			{ kind: 'state', busy: true },
			{ kind: 'delta', text: 'Hello' },
			{ kind: 'state', busy: false },
		];
		const messages: IDroxTranscriptMessage[] = [
			{ role: 'user', content: [{ type: 'text', text: 'Hi' }] },
			{
				role: 'assistant',
				content: [{ type: 'text', text: 'Hello' }],
			},
			{
				role: 'tool',
				content: [{ type: 'tool_result', tool_use_id: 'tu_x', content: 'ok', is_error: false }],
			},
		];
		const text = formatDroxCombinedSessionExport({
			sessionId: 'ses_combo',
			journal,
			transcriptMessages: messages,
		});
		assert.ok(text.includes('PARTIE B — Transcript moteur'));
		assert.ok(text.includes('PARTIE C — Journal UI brut'));
		assert.ok(text.includes('PARTIE D — Index messages moteur'));
		assert.ok(text.includes('#1\t{"kind":"append"'));
		assert.ok(text.includes('STATE'));
		assert.ok(text.includes('busy: true'));
		assert.ok(text.includes('3. TOOL — tool_result:tu_x'));
	});

	test('formatDroxCombinedSessionExport includes partie A execution summary', () => {
		const journal = [
			{ kind: 'phase', phase: 'reading' },
			{ kind: 'tool', phase: 'start', name: 'workspace_map_read', id: 'tu_1' },
			{ kind: 'tool', phase: 'finish', name: 'workspace_map_read', id: 'tu_1', isError: false },
			{ kind: 'phase', phase: 'done' },
		];
		const messages: IDroxTranscriptMessage[] = [
			{ role: 'user', content: [{ type: 'text', text: 'fix page' }] },
			{
				role: 'assistant',
				content: [
					{ type: 'tool_use', id: 'tu_1', name: 'workspace_map_read', input: {} },
				],
			},
		];
		const text = formatDroxCombinedSessionExport({
			sessionId: 'ses_summary',
			journal,
			transcriptMessages: messages,
			engineTrace: [
				{
					kind: 'run_summary',
					textToolMarkerStreak: 2,
					firstStructuredToolAtMessageIndex: 1,
					schemaErrorContinueCount: 5,
					llmIterations: 3,
					messagesCount: 4,
					stopReason: 'EndTurn',
				},
			],
		});
		assert.ok(text.includes('PARTIE A — Journal UI'));
		assert.ok(text.includes('RÉSUMÉ EXÉCUTION — diagnostic dogfood'));
		assert.ok(text.includes('Tool calls (journal UI): 1'));
		assert.ok(text.includes('Tool errors (journal UI): 0'));
		assert.ok(text.includes('Phase finale (journal UI): done'));
		assert.ok(text.includes('1er tool structuré (index message moteur): 1'));
		assert.ok(text.includes('text_tool_marker_streak (engine): 2'));
		assert.ok(text.includes('schema_error_continue_count (engine): 5'));
	});

	test('formatDroxCombinedSessionExport includes engine trace partie E', () => {
		const journal = [{ kind: 'append', role: 'user', text: 'Hi' }];
		const engineTrace = [
			{
				kind: 'run_routing' as const,
				architectGate: 'architect_edit',
				startRun: 'edit',
				greetingOnly: false,
				expectsWorkspaceMutation: true,
				intentSource: 'llm',
			},
			{
				kind: 'llm_turn_prepared' as const,
				iter: 0,
				frameId: 'architect.iteration_start',
				layersApplied: ['ctx_run_snapshot', 'tool_protocols'],
				toolNames: ['file_read', 'todo_write'],
				systemBlocks: [
					{
						blockId: 'tool_protocols_1',
						charCount: 42,
						text: '## Architect tool protocols (engine)\n\nT-file_read',
					},
				],
			},
		];
		const text = formatDroxCombinedSessionExport({
			sessionId: 'ses_trace',
			journal,
			engineTrace,
		});
		assert.ok(text.includes('PARTIE E — Engine trace'));
		assert.ok(text.includes('RUN ROUTING'));
		assert.ok(text.includes('LLM TURN PREPARED'));
		assert.ok(text.includes('tool_protocols_1'));
		assert.ok(text.includes('file_read, todo_write'));
	});

	test('formatDroxEngineTraceExport renders run summary', () => {
		const text = formatDroxEngineTraceExport({
			sessionId: 'ses_rs',
			records: [
				{
					kind: 'run_summary',
					textToolMarkerStreak: 3,
					firstStructuredToolAtMessageIndex: 5,
					schemaErrorContinueCount: 12,
					llmIterations: 8,
					messagesCount: 42,
					stopReason: 'EndTurn',
				},
			],
		});
		assert.ok(text.includes('RUN SUMMARY'));
		assert.ok(text.includes('text_tool_marker_streak: 3'));
		assert.ok(text.includes('schema_error_continue_count: 12'));
		assert.ok(text.includes('first_structured_tool_at_message_index: 5'));
	});

	test('formatDroxEngineTraceExport renders routing and system blocks', () => {
		const text = formatDroxEngineTraceExport({
			sessionId: 'ses_et',
			records: [
				{
					kind: 'run_routing',
					architectGate: 'architect_discuss',
					startRun: 'discuss_reply_only',
					greetingOnly: true,
					expectsWorkspaceMutation: false,
					intentSource: 'llm',
				},
			],
		});
		assert.ok(text.includes('discuss_reply_only'));
		assert.ok(text.includes('Intent source: llm'));
	});

	test('formatDroxUiReplayExport includes run rail station events', () => {
		const journal = [
			{ kind: 'append', role: 'user', text: 'Charte CSS' },
			{ kind: 'railStationEnter', station: 'read', label: 'Exploration' },
			{ kind: 'railStationDone', station: 'read' },
			{ kind: 'railStationEnter', station: 'propose', label: 'Proposition' },
			{ kind: 'railStationHold', station: 'propose' },
			{ kind: 'railStationEnter', station: 'act', label: 'Exécution' },
			{ kind: 'railStationDone', station: 'act' },
		];
		const text = formatDroxUiReplayExport({
			sessionId: 'ses_rail',
			journal,
		});
		assert.ok(text.includes('RAIL STATION ENTER'));
		assert.ok(text.includes('### Rail · enter · read'));
		assert.ok(text.includes('RAIL STATION HOLD'));
		assert.ok(!text.includes('RAIL SEGMENT'));
		const readIdx = text.indexOf('### Rail · enter · read');
		const holdIdx = text.indexOf('RAIL STATION HOLD');
		const actDoneIdx = text.indexOf('### Rail · done · act');
		assert.ok(readIdx < holdIdx && holdIdx < actDoneIdx);
	});

	test('formatDroxTranscriptExport includes phases, tools, and results in execution order', () => {
		const messages: IDroxTranscriptMessage[] = [
			{ role: 'user', content: [{ type: 'text', text: 'Change orb colors to dark blue' }] },
			{
				role: 'assistant',
				content: [
					{ type: 'text', text: '[phase: reading]\nScanning styles.\n[phase: acting]\nEditing.\n' },
					{ type: 'tool_use', id: 'tu_1', name: 'file_edit', input: { path: 'src/orbs.css' } },
				],
			},
			{
				role: 'tool',
				content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '{"ok":true}', is_error: false }],
			},
			{
				role: 'assistant',
				content: [{ type: 'text', text: '[phase: answering]\nDone.\n[phase: done]\n' }],
			},
		];
		const text = formatDroxTranscriptExport({
			sessionId: 'ses_test',
			messages,
			exportedAt: new Date('2026-05-20T12:00:00.000Z'),
		});
		assert.ok(text.includes('Step 1 — USER'));
		assert.ok(text.includes('Change orb colors'));
		assert.ok(text.includes('### Phase: reading'));
		assert.ok(text.includes('### Tool call: file_edit'));
		assert.ok(text.includes('### Tool result · file_edit'));
		assert.ok(text.includes('{"ok":true}'));
		const toolCallIdx = text.indexOf('### Tool call: file_edit');
		const toolResultIdx = text.indexOf('### Tool result · file_edit');
		const answeringIdx = text.indexOf('### Phase: answering');
		assert.ok(toolCallIdx >= 0 && toolResultIdx > toolCallIdx);
		assert.ok(answeringIdx > toolResultIdx);
	});

	test('formatDroxTranscriptExport formats todo_write and delegate_executor', () => {
		const messages: IDroxTranscriptMessage[] = [
			{
				role: 'assistant',
				content: [
					{
						type: 'tool_use',
						id: 'tu_todo',
						name: 'todo_write',
						input: {
							todos: [{ id: 't1', content: 'Plan', status: 'in_progress' }],
						},
					},
				],
			},
			{
				role: 'tool',
				content: [
					{
						type: 'tool_result',
						tool_use_id: 'tu_todo',
						content: '{"todos":[{"id":"t1","content":"Plan","status":"in_progress"}]}',
						is_error: false,
					},
				],
			},
			{
				role: 'assistant',
				content: [
					{
						type: 'tool_use',
						id: 'tu_del',
						name: 'delegate_executor',
						input: {
							task_id: 't1',
							description: 'Analyze src',
							instructions: 'Read app/src only.',
						},
					},
				],
			},
			{
				role: 'tool',
				content: [
					{
						type: 'tool_result',
						tool_use_id: 'tu_del',
						content: '{"taskId":"t1","status":"completed","reportMarkdown":"## Done"}',
						is_error: false,
					},
				],
			},
		];
		const text = formatDroxTranscriptExport({ sessionId: 'ses_orch', messages });
		assert.ok(text.includes('### Plan (todo_write)'));
		assert.ok(text.includes('[~] t1: Plan'));
		assert.ok(text.includes('### Delegate to Executor'));
		assert.ok(text.includes('#### Executor report'));
		assert.ok(text.includes('## Done'));
		const planIdx = text.indexOf('### Plan (todo_write)');
		const delegateIdx = text.indexOf('### Delegate to Executor');
		assert.ok(delegateIdx > planIdx);
	});

	test('formatDroxTranscriptExport formats internal_plan_write in dev export', () => {
		const messages: IDroxTranscriptMessage[] = [
			{
				role: 'assistant',
				content: [
					{
						type: 'tool_use',
						id: 'tu_plan',
						name: 'internal_plan_write',
						input: {
							steps: [{ id: 's1', action: 'Read page', status: 'in_progress' }],
						},
					},
				],
			},
			{
				role: 'tool',
				content: [
					{
						type: 'tool_result',
						tool_use_id: 'tu_plan',
						content:
							'{"ok":true,"mode":"replace","steps":[{"id":"s1","action":"Read page","status":"in_progress"}],"meta":{"tools_since_touch":0,"updated_at":"2026-06-05T12:00:00Z","step_count":1}}',
						is_error: false,
					},
				],
			},
		];
		const dev = formatDroxTranscriptExport({
			sessionId: 'ses_plan',
			messages,
			includeEngineContext: true,
		});
		assert.ok(dev.includes('### Plan interne (internal_plan_write)'));
		assert.ok(dev.includes('[~] s1: Read page'));

		const user = formatDroxTranscriptExport({
			sessionId: 'ses_plan',
			messages,
			includeEngineContext: false,
		});
		assert.ok(user.includes('plan interne mis à jour — détail masqué'));
	});
});

suite('Drox — agent.run params', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('buildAgentRunParams omits modelTier', () => {
		const params = buildAgentRunParams({
			prompt: 'hi',
			workspace: WS,
			mode: 'acceptEdits',
			sessionId: 's1',
			settings: mockLlmSettings(),
			disabledTools: [],
			mcpToolsEnabled: true,
		});
		assert.strictEqual(params.modelTier, undefined);
	});

	test('buildAgentRunParams omits legacy orchestration RPC fields', () => {
		const params = buildAgentRunParams({
			prompt: 'v1_2',
			workspace: WS,
			mode: 'acceptEdits',
			sessionId: 's1',
			settings: mockLlmSettings({ model: 'qwen3.5:9b', numCtx: 32768 }),
			disabledTools: [],
			mcpToolsEnabled: true,
		});
		assert.strictEqual(params.model, 'qwen3.5:9b');
		assert.strictEqual(params.numCtx, 32768);
		assert.strictEqual(params.subagentsModel, undefined);
		assert.strictEqual(params.subagentsNumCtx, undefined);
		assert.strictEqual(params.subagentsEnabled, undefined);
		assert.strictEqual(params.orchestrationMode, undefined);
		assert.strictEqual(params.orchestrationMaxParallelExecutors, undefined);
		assert.strictEqual(params.architectInteractionMode, undefined);
	});

	test('buildAgentRunParams wires sampling and keepAlive when set', () => {
		const params = buildAgentRunParams({
			prompt: 'hi',
			workspace: WS,
			mode: 'acceptEdits',
			sessionId: 's1',
			settings: mockLlmSettings({
				temperature: 0.7,
				maxTokens: 4096,
				topP: 0.9,
				topK: 40,
				repeatPenalty: 1.1,
				minP: 0.05,
				seed: 42,
				presencePenalty: 0.1,
				frequencyPenalty: 0.2,
				keepAlive: '5m',
			}),
			disabledTools: [],
			mcpToolsEnabled: true,
		});
		assert.strictEqual(params.temperature, 0.7);
		assert.strictEqual(params.maxTokens, 4096);
		assert.strictEqual(params.topP, 0.9);
		assert.strictEqual(params.topK, 40);
		assert.strictEqual(params.repeatPenalty, 1.1);
		assert.strictEqual(params.minP, 0.05);
		assert.strictEqual(params.seed, 42);
		assert.strictEqual(params.presencePenalty, 0.1);
		assert.strictEqual(params.frequencyPenalty, 0.2);
		assert.strictEqual(params.keepAlive, '5m');
	});

	test('buildAgentRunParams omits unset sampling keys', () => {
		const params = buildAgentRunParams({
			prompt: 'hi',
			workspace: WS,
			mode: 'acceptEdits',
			sessionId: 's1',
			settings: mockLlmSettings(),
			disabledTools: [],
			mcpToolsEnabled: true,
		});
		assert.strictEqual(params.topP, undefined);
		assert.strictEqual(params.topK, undefined);
		assert.strictEqual(params.repeatPenalty, undefined);
		assert.strictEqual(params.minP, undefined);
		assert.strictEqual(params.seed, undefined);
		assert.strictEqual(params.presencePenalty, undefined);
		assert.strictEqual(params.frequencyPenalty, undefined);
		assert.strictEqual(params.keepAlive, undefined);
	});

	test('effectiveMaxTokensForRun prefers maxTokens over numPredict', () => {
		const settings = mockLlmSettings({ maxTokens: 2048, numPredict: 8192 });
		assert.strictEqual(effectiveMaxTokensForRun(settings), 2048);
	});

	test('buildAgentRunParams falls back to numPredict for maxTokens', () => {
		const params = buildAgentRunParams({
			prompt: 'hi',
			workspace: WS,
			mode: 'acceptEdits',
			sessionId: 's1',
			settings: mockLlmSettings({ numPredict: 8192 }),
			disabledTools: [],
			mcpToolsEnabled: true,
		});
		assert.strictEqual(params.maxTokens, 8192);
	});

	test('llmSettingsToEnv uses effective max output tokens', () => {
		const env = llmSettingsToEnv(mockLlmSettings({ maxTokens: 2048, numPredict: 8192 }));
		assert.strictEqual(env.DROX_NUM_PREDICT, '2048');
	});

	test('buildAgentRunParams omits deprecated engineStrictness and engineTuning', () => {
		const params = buildAgentRunParams({
			prompt: 'hi',
			workspace: WS,
			mode: 'acceptEdits',
			sessionId: 's1',
			settings: mockLlmSettings(),
			disabledTools: [],
			mcpToolsEnabled: true,
		});
		assert.strictEqual('engineStrictness' in params, false);
		assert.strictEqual('engineTuning' in params, false);
	});

	test('normalizeLlmServerBaseUrl strips trailing slash', () => {
		assert.strictEqual(normalizeLlmServerBaseUrl('http://127.0.0.1:11434/'), 'http://127.0.0.1:11434');
		assert.strictEqual(normalizeLlmServerBaseUrl('localhost:11434'), 'http://localhost:11434');
	});

	test('resolveOllamaServerUrl defaults when empty', () => {
		assert.strictEqual(resolveOllamaServerUrl(''), 'http://127.0.0.1:11434');
	});

	test('parseLlmProvider recognizes ollama vllm lmstudio', () => {
		assert.strictEqual(parseLlmProvider('ollama'), 'ollama');
		assert.strictEqual(parseLlmProvider('vllm'), 'vllm');
		assert.strictEqual(parseLlmProvider('lmstudio'), 'lmstudio');
		assert.strictEqual(parseLlmProvider('unknown'), 'ollama');
	});

	test('resolveLlmServerUrl defaults per provider', () => {
		assert.strictEqual(resolveLlmServerUrl('ollama', ''), 'http://127.0.0.1:11434');
		assert.strictEqual(resolveLlmServerUrl('vllm', ''), 'http://127.0.0.1:8000');
		assert.strictEqual(resolveLlmServerUrl('lmstudio', ''), 'http://127.0.0.1:1234');
		assert.strictEqual(resolveOllamaServerUrl(''), resolveLlmServerUrl('ollama', ''));
	});

	test('isDroxWebviewToHostMessage accepts setModel and refreshLlmModels', () => {
		assert.ok(isDroxWebviewToHostMessage({ type: 'refreshLlmModels' }));
		assert.ok(isDroxWebviewToHostMessage({ type: 'showReleaseNotes' }));
		assert.ok(isDroxWebviewToHostMessage({
			type: 'testLlmConnection',
			requestId: 'r1',
			settings: { server: 'http://127.0.0.1:11434' },
		}));
		assert.ok(isDroxWebviewToHostMessage({ type: 'setModel', model: 'qwen2.5:7b' }));
	});

	test('updateDroxLlmModelEnum refreshes settings enum', () => {
		updateDroxLlmModelEnum(['alpha', 'beta']);
		assert.deepStrictEqual([...droxLlmModelEnumValues], ['alpha', 'beta']);
		updateDroxLlmModelEnum([]);
		assert.deepStrictEqual([...droxLlmModelEnumValues], ['']);
	});

	test('buildLlmModelListUrl uses configured server only', () => {
		const remote = buildLlmModelListUrl('ollama', 'http://192.168.1.50:11434');
		assert.ok('url' in remote);
		if ('url' in remote) {
			assert.strictEqual(remote.url, 'http://192.168.1.50:11434/api/tags');
		}
		const empty = buildLlmModelListUrl('ollama', '');
		assert.ok('error' in empty);
	});

	test('parseDroxEnvFileContent reads DROX_SERVER and DROX_MODEL', () => {
		const env = parseDroxEnvFileContent('DROX_SERVER=http://localhost:11434\nDROX_MODEL=qwen2.5:7b # note\n');
		assert.strictEqual(env.DROX_SERVER, 'http://localhost:11434');
		assert.strictEqual(env.DROX_MODEL, 'qwen2.5:7b');
	});

});

suite('Drox — session list ids', () => {
	test('isListableDroxSessionId accepts transcript ids only', () => {
		assert.strictEqual(isListableDroxSessionId('ses_01932f8a-0000-7000-8000-000000000001'), true);
		assert.strictEqual(isListableDroxSessionId('ses_abc.ui-replay'), false);
		assert.strictEqual(isListableDroxSessionId('msg_abc'), false);
		assert.strictEqual(isListableDroxSessionId(''), false);
	});
});

suite('Drox — run revert history', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	class FakeFileService {
		private readonly files = new Map<string, string>();
		private readonly folders = new Set<string>();

		async exists(uri: URI): Promise<boolean> {
			const key = uri.fsPath;
			return this.files.has(key) || this.folders.has(key);
		}

		async readFile(uri: URI): Promise<{ value: VSBuffer }> {
			const key = uri.fsPath;
			if (!this.files.has(key)) {
				throw new Error('ENOENT');
			}
			return { value: VSBuffer.fromString(this.files.get(key) || '') };
		}

		async writeFile(uri: URI, data: VSBuffer, opts?: { append?: boolean }): Promise<void> {
			const key = uri.fsPath;
			const txt = data.toString();
			if (opts?.append) {
				this.files.set(key, `${this.files.get(key) || ''}${txt}`);
				return;
			}
			this.files.set(key, txt);
		}

		async createFolder(uri: URI): Promise<void> {
			this.folders.add(uri.fsPath);
		}

		async del(uri: URI): Promise<void> {
			this.files.delete(uri.fsPath);
		}
	}

	test('resetDroxWorkspaceOnDisk purges .drox except .env', async () => {
		class ResetFakeFileService {
			readonly files = new Map<string, string>();
			readonly dirs = new Set<string>();

			private norm(p: string): string {
				let s = p.replace(/\\/g, '/');
				if (process.platform === 'win32' && /^[a-zA-Z]:/.test(s)) {
					s = s[0].toLowerCase() + s.slice(1);
				}
				return s;
			}

			async exists(uri: URI): Promise<boolean> {
				const key = this.norm(uri.fsPath);
				return this.files.has(key) || this.dirs.has(key);
			}

			async resolve(uri: URI): Promise<{ children: Array<{ name: string; isDirectory: boolean; resource: URI }> }> {
				const prefix = this.norm(uri.fsPath);
				const children: Array<{ name: string; isDirectory: boolean; resource: URI }> = [];
				const seen = new Set<string>();
				for (const d of this.dirs) {
					if (d === prefix || !d.startsWith(prefix + '/')) {
						continue;
					}
					const rest = d.slice(prefix.length + 1);
					const name = rest.split('/')[0];
					if (!name || seen.has(name)) {
						continue;
					}
					seen.add(name);
					children.push({
						name,
						isDirectory: true,
						resource: URI.file(join(prefix, name)),
					});
				}
				for (const f of this.files.keys()) {
					if (!f.startsWith(prefix + '/')) {
						continue;
					}
					const rest = f.slice(prefix.length + 1);
					if (!rest.includes('/')) {
						children.push({ name: rest, isDirectory: false, resource: URI.file(f) });
					}
				}
				return { children };
			}

			async del(uri: URI, opts?: { recursive?: boolean }): Promise<void> {
				const key = this.norm(uri.fsPath);
				this.files.delete(key);
				if (opts?.recursive) {
					for (const f of [...this.files.keys()]) {
						if (f.startsWith(key + '/')) {
							this.files.delete(f);
						}
					}
					for (const d of [...this.dirs]) {
						if (d === key || d.startsWith(key + '/')) {
							this.dirs.delete(d);
						}
					}
				}
				this.dirs.delete(key);
			}

			seed(path: string, content = ''): void {
				const norm = this.norm(path);
				const lastSlash = norm.lastIndexOf('/');
				if (lastSlash > 0) {
					const dirPath = norm.slice(0, lastSlash);
					const parts = dirPath.split('/');
					let acc = parts[0] ?? '';
					for (let i = 1; i < parts.length; i++) {
						acc = `${acc}/${parts[i]}`;
						this.dirs.add(acc);
					}
				}
				if (!norm.endsWith('/')) {
					this.files.set(norm, content);
				}
			}
		}

		const ws = process.platform === 'win32' ? 'C:/tmp/ws-reset' : '/tmp/ws-reset';
		const fs = new ResetFakeFileService();
		fs.seed(join(ws, '.drox', '.env'), 'DROX_SERVER=http://localhost');
		fs.seed(join(ws, '.drox', 'sessions', 'ses_a.jsonl'), '{}');
		fs.seed(join(ws, '.drox', 'sessions', 'ses_a.ui-replay.jsonl'), '{}');
		fs.seed(join(ws, '.drox', 'workspace-map.json'), '{}');
		fs.seed(join(ws, '.drox', 'long-memory', 'db.json'), '{}');
		fs.seed(join(ws, 'MEMORY.md'), '# project memory');

		const result = await resetDroxWorkspaceOnDisk(fs as never, ws);
		assert.strictEqual(result.sessionsFilesRemoved, 2);
		assert.strictEqual(result.workspaceMapRemoved, true);
		assert.strictEqual(result.longMemoryCleared, true);
		assert.strictEqual(result.memoryMdRemoved, true);
		assert.ok(await fs.exists(URI.file(join(ws, '.drox', '.env'))));
		assert.ok(!(await fs.exists(URI.file(join(ws, '.drox', 'sessions', 'ses_a.jsonl')))));
		assert.ok(!(await fs.exists(URI.file(join(ws, 'MEMORY.md')))));
	});

	test('revertToMessage restores before-content snapshot', async () => {
		const fs = new FakeFileService();
		const svc = new DroxRunRevertService(fs as never);
		const ws = process.platform === 'win32' ? 'C:\\tmp\\ws' : '/tmp/ws';
		const file = process.platform === 'win32' ? 'C:\\tmp\\ws\\a.txt' : '/tmp/ws/a.txt';
		await fs.writeFile(URI.file(file), VSBuffer.fromString('before'));

		svc.beginRun('r1', ws, 'ses_a');
		svc.setRunFirstMessageId('r1', 'msg_user');
		await svc.captureBeforeWrite(ws, file);
		await fs.writeFile(URI.file(file), VSBuffer.fromString('after'));
		svc.recordRunMessage('r1', 'msg_assistant');
		svc.finalizeRun('r1');

		const out = await svc.revertToMessage(ws, 'msg_assistant');
		assert.strictEqual(out.errors.length, 0);
		assert.strictEqual(out.revertedPaths.length, 1);
		const restored = await fs.readFile(URI.file(file));
		assert.strictEqual(restored.value.toString(), 'before');
		svc.dispose();
	});

	test('undoFileChange and redoFileChange toggle file content', async () => {
		const fs = new FakeFileService();
		const svc = new DroxRunRevertService(fs as never);
		const ws = process.platform === 'win32' ? 'C:\\tmp\\ws3' : '/tmp/ws3';
		const file = process.platform === 'win32' ? 'C:\\tmp\\ws3\\c.txt' : '/tmp/ws3/c.txt';
		await fs.writeFile(URI.file(file), VSBuffer.fromString('before'));
		svc.beginRun('r4', ws, 'ses_undo');
		await svc.captureBeforeWrite(ws, file);
		await fs.writeFile(URI.file(file), VSBuffer.fromString('after'));
		svc.trackFileChange({
			toolId: 'tool_1',
			absPath: file,
			beforeContent: 'before',
			afterContent: 'after',
			hadFile: true,
		});
		const undo = await svc.undoFileChange('tool_1');
		assert.strictEqual(undo.errors.length, 0);
		assert.strictEqual((await fs.readFile(URI.file(file))).value.toString(), 'before');
		assert.strictEqual(svc.getFileChangeUndoState('tool_1'), 'reverted');
		const redo = await svc.redoFileChange('tool_1');
		assert.strictEqual(redo.errors.length, 0);
		assert.strictEqual((await fs.readFile(URI.file(file))).value.toString(), 'after');
		assert.strictEqual(svc.getFileChangeUndoState('tool_1'), 'applied');
		svc.dispose();
	});

	test('listRevertHistory filters by session', async () => {
		const fs = new FakeFileService();
		const svc = new DroxRunRevertService(fs as never);
		const ws = process.platform === 'win32' ? 'C:\\tmp\\ws2' : '/tmp/ws2';
		const file = process.platform === 'win32' ? 'C:\\tmp\\ws2\\b.txt' : '/tmp/ws2/b.txt';
		await fs.writeFile(URI.file(file), VSBuffer.fromString('v0'));

		svc.beginRun('r2', ws, 'ses_one');
		svc.setRunFirstMessageId('r2', 'm1');
		await svc.captureBeforeWrite(ws, file);
		await fs.writeFile(URI.file(file), VSBuffer.fromString('v1'));
		svc.finalizeRun('r2');

		svc.beginRun('r3', ws, 'ses_two');
		svc.setRunFirstMessageId('r3', 'm2');
		await svc.captureBeforeWrite(ws, file);
		await fs.writeFile(URI.file(file), VSBuffer.fromString('v2'));
		svc.finalizeRun('r3');

		const one = await svc.listRevertHistory(ws, 'ses_one');
		assert.strictEqual(one.length, 1);
		assert.strictEqual(one[0].runId, 'r2');
		svc.dispose();
	});

	test('isUnderDroxAgentOutputPath detects executor deliverables', () => {
		const ws = 'C:\\proj';
		assert.ok(
			isUnderDroxAgentOutputPath(
				'C:\\proj\\.drox\\agent-output\\plan_1\\t1\\report.md',
				ws,
			),
		);
		assert.ok(
			isUnderDroxAgentOutputPath(
				'C:/proj/.drox/agent-output/plan_1/t1/report.md',
				ws,
			),
		);
		assert.ok(!isUnderDroxAgentOutputPath('C:\\proj\\src\\app.tsx', ws));
		assert.ok(!isUnderDroxAgentOutputPath('C:\\proj\\.drox\\sessions\\x.jsonl', ws));
	});
});
