/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { previewJson, describeToolCall } from './droxToolPreview.js';
import { extractTodoErrorMessage, extractTodosFromToolOutput } from './droxTodoExtract.js';
import {
	IDroxSessionUiStats,
	IDroxTranscriptContentBlock,
	IDroxTranscriptMessage,
} from '../droxSession.js';

const PHASE_LINE_RE = /^\[phase:\s*([^\]]+)\]\s*$/i;
const RUN_OBJECTIVE_RE = /^\[run_objective:\s*(.+)\]\s*$/i;
const DROX_TOOL_WRAPPER_RE = /^\[drox:[^\]]*\]\s*/i;
const USER_REQUEST_RE = /^##\s*User request\s*$/im;
const USER_REMINDER_RE = /^##\s*Reminder\s*$/im;
const INTERNAL_WORK_PLAN_MARKER = '## Internal work plan (engine only)';
const DEFAULT_MAX_SYSTEM_CHARS = 12_000;
const DEFAULT_MAX_SYSTEM_CHARS_ENGINE = 200_000;
const DEFAULT_MAX_TOOL_RESULT_CHARS = 80_000;
const DEFAULT_MAX_DELEGATE_REPORT_CHARS = 120_000;

export interface IFormatDroxTranscriptExportOptions {
	readonly sessionId: string;
	readonly workspacePath?: string;
	readonly messages: readonly IDroxTranscriptMessage[];
	readonly uiStats?: IDroxSessionUiStats;
	readonly exportedAt?: Date;
	readonly maxSystemChars?: number;
	readonly maxToolResultChars?: number;
	readonly maxDelegateReportChars?: number;
	/** Dev export — inclure le plan interne L2 et limites system plus larges. */
	readonly includeEngineContext?: boolean;
}

interface IToolResultRef {
	readonly block: IDroxTranscriptContentBlock;
	readonly messageIndex: number;
}

function roleLabel(role: IDroxTranscriptMessage['role']): string {
	switch (role) {
		case 'user':
			return 'USER';
		case 'assistant':
			return 'ASSISTANT';
		case 'tool':
			return 'TOOL RESULT';
		case 'system':
			return 'SYSTEM';
	}
}

export function pushDroxExportStepSeparator(out: string[], step: number, title: string): void {
	out.push('');
	out.push('═'.repeat(72));
	out.push(`Step ${step} — ${title}`);
	out.push('═'.repeat(72));
	out.push('');
}

export function formatDroxPhaseAwareText(text: string, out: string[]): void {
	const lines = text.replace(/\r\n/g, '\n').split('\n');
	const buf: string[] = [];
	const flushBuf = (): void => {
		const chunk = buf.join('\n').trim();
		buf.length = 0;
		if (chunk) {
			out.push(chunk);
			out.push('');
		}
	};
	for (const line of lines) {
		const phase = PHASE_LINE_RE.exec(line.trim());
		if (phase) {
			flushBuf();
			out.push(`### Phase: ${phase[1].trim()}`);
			out.push('');
			continue;
		}
		const objective = RUN_OBJECTIVE_RE.exec(line.trim());
		if (objective) {
			flushBuf();
			out.push('### Run objective');
			out.push(objective[1].trim());
			out.push('');
			continue;
		}
		buf.push(line);
	}
	flushBuf();
}

function blockText(block: IDroxTranscriptContentBlock): string | undefined {
	if (typeof block.text === 'string' && block.text.length > 0) {
		return block.text;
	}
	if (typeof block.content === 'string' && block.content.length > 0) {
		return block.content;
	}
	return undefined;
}

function joinTextBlocks(blocks: readonly IDroxTranscriptContentBlock[]): string {
	const parts: string[] = [];
	for (const b of blocks) {
		if (b.type === 'text') {
			const t = blockText(b);
			if (t) {
				parts.push(t);
			}
		}
	}
	return parts.join('\n').trim();
}

function stripDroxToolWrapper(raw: string): string {
	return raw.replace(DROX_TOOL_WRAPPER_RE, '').trim();
}

function parseJsonRecord(raw: string): Record<string, unknown> | null {
	const trimmed = stripDroxToolWrapper(raw);
	if (!trimmed) {
		return null;
	}
	try {
		const v = JSON.parse(trimmed) as unknown;
		return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function detectSystemBlockKind(text: string): string {
	if (text.includes('## Architect run snapshot (engine)')) {
		return 'ctx_run_snapshot';
	}
	if (text.includes('## Architect tool protocols (engine)')) {
		return 'tool_protocols';
	}
	if (text.includes('## Run rail (engine)')) {
		return 'rail_snapshot';
	}
	if (text.includes(INTERNAL_WORK_PLAN_MARKER)) {
		return 'internal_plan';
	}
	if (text.includes('## Context compaction checkpoint')) {
		return 'compaction_checkpoint';
	}
	return 'boot_or_other';
}

function formatSystemText(text: string, maxChars: number, out: string[], includeEngineContext: boolean): void {
	const trimmed = text.trim();
	if (!trimmed) {
		out.push('(empty)');
		out.push('');
		return;
	}
	if (includeEngineContext) {
		out.push(`### System · ${detectSystemBlockKind(trimmed)} (${trimmed.length} chars)`);
		out.push('');
	}
	if (trimmed.length <= maxChars) {
		out.push(trimmed);
		out.push('');
		return;
	}
	out.push(trimmed.slice(0, maxChars));
	out.push('');
	out.push(`… [system prompt truncated — ${trimmed.length - maxChars} chars omitted]`);
	out.push('');
}

function formatTruncated(raw: string, maxChars: number, out: string[], label: string): void {
	if (raw.length <= maxChars) {
		out.push(raw);
		out.push('');
		return;
	}
	out.push(raw.slice(0, maxChars));
	out.push('');
	out.push(`… [${label} truncated — ${raw.length - maxChars} chars omitted]`);
	out.push('');
}

function todoStatusGlyph(status: string): string {
	switch (status) {
		case 'completed':
			return '[x]';
		case 'in_progress':
			return '[~]';
		case 'cancelled':
			return '[-]';
		default:
			return '[ ]';
	}
}

function formatTodoPlan(todos: readonly { id: string; content: string; status: string }[], out: string[]): void {
	out.push('### Plan (todo_write)');
	out.push('');
	for (const t of todos) {
		out.push(`${todoStatusGlyph(t.status)} ${t.id}: ${t.content} (${t.status})`);
	}
	const counts = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
	for (const t of todos) {
		if (t.status in counts) {
			counts[t.status as keyof typeof counts] += 1;
		}
	}
	out.push('');
	out.push(
		`Summary: ${counts.pending} pending · ${counts.in_progress} in_progress · ${counts.completed} completed · ${counts.cancelled} cancelled`,
	);
	out.push('');
}

interface IInternalPlanStep {
	readonly id: string;
	readonly action: string;
	readonly status: string;
	readonly paths?: readonly string[];
	readonly done_when?: string;
}

function extractInternalPlanFromToolOutput(raw: string): {
	readonly steps: readonly IInternalPlanStep[];
	readonly mode?: string;
	readonly meta?: Record<string, unknown>;
} | null {
	const rec = parseJsonRecord(raw);
	if (!rec) {
		return null;
	}
	const stepsRaw = rec.steps;
	if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
		return null;
	}
	const steps: IInternalPlanStep[] = [];
	for (const s of stepsRaw) {
		if (!s || typeof s !== 'object') {
			continue;
		}
		const step = s as Record<string, unknown>;
		const id = typeof step.id === 'string' ? step.id : '';
		const action = typeof step.action === 'string' ? step.action : '';
		const status = typeof step.status === 'string' ? step.status : 'pending';
		if (!id || !action) {
			continue;
		}
		const paths = Array.isArray(step.paths)
			? step.paths.filter((p): p is string => typeof p === 'string')
			: undefined;
		const done_when = typeof step.done_when === 'string' ? step.done_when : undefined;
		steps.push({ id, action, status, paths, done_when });
	}
	if (steps.length === 0) {
		return null;
	}
	const mode = typeof rec.mode === 'string' ? rec.mode : undefined;
	const meta =
		rec.meta && typeof rec.meta === 'object' ? (rec.meta as Record<string, unknown>) : undefined;
	return { steps, mode, meta };
}

function formatInternalPlan(
	plan: {
		readonly steps: readonly IInternalPlanStep[];
		readonly mode?: string;
		readonly meta?: Record<string, unknown>;
	},
	out: string[],
	includeEngineContext: boolean,
): void {
	out.push('### Plan interne (internal_plan_write) — engine only');
	out.push('');
	for (const s of plan.steps) {
		const paths =
			s.paths && s.paths.length > 0 ? ` · \`${s.paths.join('`, `')}\`` : '';
		const done =
			s.done_when && s.done_when.trim().length > 0
				? ` _(done when: ${s.done_when.trim()})_`
				: '';
		out.push(`${todoStatusGlyph(s.status)} ${s.id}: ${s.action}${paths} (${s.status})${done}`);
	}
	const counts = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
	for (const s of plan.steps) {
		if (s.status in counts) {
			counts[s.status as keyof typeof counts] += 1;
		}
	}
	out.push('');
	out.push(
		`Summary: ${counts.pending} pending · ${counts.in_progress} in_progress · ${counts.completed} completed · ${counts.cancelled} cancelled`,
	);
	if (includeEngineContext) {
		const metaParts: string[] = [];
		if (plan.mode) {
			metaParts.push(`mode=${plan.mode}`);
		}
		if (plan.meta) {
			if (typeof plan.meta.updated_at === 'string') {
				metaParts.push(`updated_at=${plan.meta.updated_at}`);
			}
			if (typeof plan.meta.tools_since_touch === 'number') {
				metaParts.push(`tools_since_touch=${plan.meta.tools_since_touch}`);
			}
			if (typeof plan.meta.step_count === 'number') {
				metaParts.push(`step_count=${plan.meta.step_count}`);
			}
		}
		if (metaParts.length > 0) {
			out.push(`Meta: ${metaParts.join(' · ')}`);
		}
	}
	out.push('');
}

function formatDelegateCall(input: unknown, out: string[]): void {
	const a = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
	const taskId = typeof a.task_id === 'string' ? a.task_id : typeof a.taskId === 'string' ? a.taskId : '';
	const description = typeof a.description === 'string' ? a.description : '';
	const deliverable = typeof a.deliverable === 'string' ? a.deliverable : '';
	const instructions = typeof a.instructions === 'string' ? a.instructions : '';
	const context = typeof a.context === 'string' ? a.context : '';
	const scope = Array.isArray(a.scope)
		? a.scope.filter((s): s is string => typeof s === 'string').join(', ')
		: typeof a.scope === 'string'
			? a.scope
			: '';
	out.push('### Delegate to Executor (ephemeral — no user chat)');
	out.push('');
	if (taskId) {
		out.push(`Task: ${taskId}`);
	}
	if (description.trim()) {
		out.push('');
		out.push('Description:');
		out.push(description.trim());
	}
	if (deliverable.trim()) {
		out.push('');
		out.push('Deliverable:');
		out.push(deliverable.trim());
	}
	if (instructions.trim()) {
		out.push('');
		out.push('Instructions:');
		out.push(instructions.trim());
	}
	if (context.trim()) {
		out.push('');
		out.push('Architect context:');
		out.push(context.trim());
	}
	if (scope.trim()) {
		out.push('');
		out.push(`Scope: ${scope.trim()}`);
	}
	out.push('');
}

function formatDelegateResult(
	raw: string,
	maxToolResult: number,
	maxReport: number,
	out: string[],
): void {
	const rec = parseJsonRecord(raw);
	if (!rec) {
		formatTruncated(stripDroxToolWrapper(raw), maxToolResult, out, 'delegate result');
		return;
	}
	const taskId =
		typeof rec.taskId === 'string'
			? rec.taskId
			: typeof rec.task_id === 'string'
				? rec.task_id
				: '';
	const status = typeof rec.status === 'string' ? rec.status : '?';
	const iterations =
		typeof rec.iterationsUsed === 'number'
			? rec.iterationsUsed
			: typeof rec.iterations_used === 'number'
				? rec.iterations_used
				: undefined;
	const truncated = rec.truncated === true;
	out.push('### Executor delegation result');
	out.push('');
	if (taskId) {
		out.push(`Task: ${taskId}`);
	}
	out.push(`Status: ${status}${truncated ? ' (truncated — iteration limit)' : ''}`);
	if (iterations !== undefined) {
		out.push(`Iterations: ${iterations}`);
	}
	const report =
		typeof rec.reportMarkdown === 'string'
			? rec.reportMarkdown
			: typeof rec.report_markdown === 'string'
				? rec.report_markdown
				: '';
	if (report.trim()) {
		out.push('');
		out.push('#### Executor report');
		out.push('');
		formatTruncated(report.trim(), maxReport, out, 'executor report');
	}
	const err = typeof rec.error === 'string' ? rec.error : '';
	if (err.trim()) {
		out.push('#### Error');
		out.push(err.trim());
		out.push('');
	}
	const rest = { ...rec };
	delete rest.taskId;
	delete rest.task_id;
	delete rest.status;
	delete rest.iterationsUsed;
	delete rest.iterations_used;
	delete rest.truncated;
	delete rest.reportMarkdown;
	delete rest.report_markdown;
	delete rest.error;
	if (Object.keys(rest).length > 0) {
		out.push('#### Raw metadata');
		out.push('');
		out.push(previewJson(rest, 4000));
		out.push('');
	}
}

function formatUserSections(text: string, out: string[]): void {
	const normalized = text.replace(/\r\n/g, '\n').trim();
	if (!normalized) {
		out.push('(empty)');
		out.push('');
		return;
	}
	const requestIdx = normalized.search(USER_REQUEST_RE);
	const reminderIdx = normalized.search(USER_REMINDER_RE);
	if (requestIdx < 0 && reminderIdx < 0) {
		out.push(normalized);
		out.push('');
		return;
	}
	const sections: { title: string; body: string }[] = [];
	const markers: { idx: number; title: string }[] = [];
	if (requestIdx >= 0) {
		markers.push({ idx: requestIdx, title: 'User request' });
	}
	if (reminderIdx >= 0) {
		markers.push({ idx: reminderIdx, title: 'Architect reminder (injected)' });
	}
	markers.sort((a, b) => a.idx - b.idx);
	for (let i = 0; i < markers.length; i++) {
		const start = markers[i].idx;
		const headerEnd = normalized.indexOf('\n', start);
		const bodyStart = headerEnd >= 0 ? headerEnd + 1 : start;
		const end = i + 1 < markers.length ? markers[i + 1].idx : normalized.length;
		const body = normalized.slice(bodyStart, end).trim();
		if (body) {
			sections.push({ title: markers[i].title, body });
		}
	}
	const before = markers[0]?.idx > 0 ? normalized.slice(0, markers[0].idx).trim() : '';
	if (before) {
		out.push(before);
		out.push('');
	}
	for (const s of sections) {
		out.push(`### ${s.title}`);
		out.push('');
		out.push(s.body);
		out.push('');
	}
}

function indexToolResults(messages: readonly IDroxTranscriptMessage[]): Map<string, IToolResultRef> {
	const map = new Map<string, IToolResultRef>();
	for (let i = 0; i < messages.length; i++) {
		const m = messages[i];
		if (m.role !== 'tool') {
			continue;
		}
		const blocks = Array.isArray(m.content) ? m.content : [];
		for (const block of blocks) {
			if (block.type !== 'tool_result') {
				continue;
			}
			const id = typeof block.tool_use_id === 'string' ? block.tool_use_id : '';
			if (id) {
				map.set(id, { block, messageIndex: i });
			}
		}
	}
	return map;
}

function formatToolResultRich(
	toolName: string | undefined,
	raw: string,
	isError: boolean,
	maxToolResult: number,
	maxDelegateReport: number,
	out: string[],
	includeEngineContext: boolean,
): void {
	const cleaned = stripDroxToolWrapper(raw);
	const errPrefix = isError ? ' · ERROR' : '';

	if (toolName === 'todo_write') {
		out.push(`### Tool result${errPrefix} · todo_write`);
		out.push('');
		if (isError) {
			const msg = extractTodoErrorMessage(cleaned) ?? cleaned;
			out.push(msg);
			out.push('');
			return;
		}
		const todos = extractTodosFromToolOutput(cleaned);
		if (todos) {
			formatTodoPlan(todos, out);
			return;
		}
	}

	if (toolName === 'internal_plan_write') {
		out.push(`### Tool result${errPrefix} · internal_plan_write`);
		out.push('');
		if (isError) {
			out.push(cleaned);
			out.push('');
			return;
		}
		if (!includeEngineContext) {
			out.push('(plan interne mis à jour — détail masqué export utilisateur)');
			out.push('');
			return;
		}
		const plan = extractInternalPlanFromToolOutput(cleaned);
		if (plan) {
			formatInternalPlan(plan, out, true);
			return;
		}
		out.push('(plan interne mis à jour — détail non structuré)');
		out.push('');
		formatTruncated(cleaned, maxToolResult, out, 'tool output');
		return;
	}

	if (toolName === 'delegate_executor') {
		out.push(`### Tool result${errPrefix} · delegate_executor`);
		out.push('');
		formatDelegateResult(cleaned, maxToolResult, maxDelegateReport, out);
		return;
	}

	out.push(`### Tool result${errPrefix}${toolName ? ` · ${toolName}` : ''}`);
	out.push('');

	if (isError && /Blocked:/i.test(cleaned)) {
		out.push('#### Gate / policy block');
		out.push('');
	}

	formatTruncated(cleaned, maxToolResult, out, 'tool output');
}

function emitToolResult(
	toolUseId: string,
	toolName: string | undefined,
	toolResults: Map<string, IToolResultRef>,
	consumed: Set<string>,
	maxToolResult: number,
	maxDelegateReport: number,
	out: string[],
	includeEngineContext: boolean,
): boolean {
	const ref = toolResults.get(toolUseId);
	if (!ref || consumed.has(toolUseId)) {
		out.push('### Tool result · (missing in transcript)');
		out.push('');
		return false;
	}
	consumed.add(toolUseId);
	const block = ref.block;
	const raw = typeof block.content === 'string' ? block.content : previewJson(block.content, maxToolResult);
	formatToolResultRich(
		toolName,
		raw,
		Boolean(block.is_error),
		maxToolResult,
		maxDelegateReport,
		out,
		includeEngineContext,
	);
	return true;
}

function formatAssistantBlocksChronological(
	blocks: readonly IDroxTranscriptContentBlock[],
	toolResults: Map<string, IToolResultRef>,
	consumed: Set<string>,
	maxToolResult: number,
	maxDelegateReport: number,
	out: string[],
	includeEngineContext: boolean,
): void {
	for (const block of blocks) {
		if (block.type === 'text') {
			const text = blockText(block);
			if (text?.trim()) {
				formatDroxPhaseAwareText(text, out);
			}
			continue;
		}
		if (block.type === 'thinking' || block.type === 'internal_reasoning') {
			const text = blockText(block);
			if (text?.trim()) {
				out.push('### Reflection (native thinking)');
				out.push('');
				out.push(text.trim());
				out.push('');
			}
			continue;
		}
		if (block.type === 'tool_use') {
			const name = typeof block.name === 'string' ? block.name : 'tool';
			const id = typeof block.id === 'string' ? block.id : '';
			const { verb, target } = describeToolCall(name, block.input);
			const summary = target ? `${verb} — ${target}` : verb;
			out.push(`### Tool call: ${name}${id ? ` (${id})` : ''}`);
			out.push('');
			out.push(`→ ${summary}`);
			out.push('');
			if (name === 'todo_write') {
				const todos = extractTodosFromToolOutput(block.input);
				if (todos) {
					formatTodoPlan(todos, out);
				} else {
					out.push(previewJson(block.input, 12_000));
					out.push('');
				}
			} else if (name === 'delegate_executor') {
				formatDelegateCall(block.input, out);
				out.push('Input (raw):');
				out.push('');
				out.push(previewJson(block.input, 8000));
				out.push('');
			} else {
				out.push(previewJson(block.input, 12_000));
				out.push('');
			}
			if (id) {
				emitToolResult(
					id,
					name,
					toolResults,
					consumed,
					maxToolResult,
					maxDelegateReport,
					out,
					includeEngineContext,
				);
			}
		}
	}
}

function emitOrphanToolResults(
	messages: readonly IDroxTranscriptMessage[],
	consumed: Set<string>,
	maxToolResult: number,
	maxDelegateReport: number,
	out: string[],
	step: { value: number },
	includeEngineContext: boolean,
): void {
	for (const m of messages) {
		if (m.role !== 'tool') {
			continue;
		}
		const blocks = Array.isArray(m.content) ? m.content : [];
		for (const block of blocks) {
			if (block.type !== 'tool_result') {
				continue;
			}
			const id = typeof block.tool_use_id === 'string' ? block.tool_use_id : '';
			if (!id || consumed.has(id)) {
				continue;
			}
			step.value += 1;
			pushDroxExportStepSeparator(out, step.value, `TOOL RESULT (orphan${id ? ` · ${id}` : ''})`);
			consumed.add(id);
			const raw = typeof block.content === 'string' ? block.content : previewJson(block.content, maxToolResult);
			formatToolResultRich(
				undefined,
				raw,
				Boolean(block.is_error),
				maxToolResult,
				maxDelegateReport,
				out,
				includeEngineContext,
			);
		}
	}
}

/** Full session transcript as plain text in chronological execution order. */
export function formatDroxTranscriptExport(opts: IFormatDroxTranscriptExportOptions): string {
	const exportedAt = opts.exportedAt ?? new Date();
	const maxSystem = opts.maxSystemChars
		?? (opts.includeEngineContext !== false ? DEFAULT_MAX_SYSTEM_CHARS_ENGINE : DEFAULT_MAX_SYSTEM_CHARS);
	const includeEngineContext = opts.includeEngineContext !== false;
	const maxToolResult = opts.maxToolResultChars ?? DEFAULT_MAX_TOOL_RESULT_CHARS;
	const maxDelegateReport = opts.maxDelegateReportChars ?? DEFAULT_MAX_DELEGATE_REPORT_CHARS;
	const out: string[] = [];

	const toolResults = indexToolResults(opts.messages);
	const consumed = new Set<string>();
	const step = { value: 0 };

	out.push('Drox chat export');
	out.push(`Session: ${opts.sessionId}`);
	if (opts.workspacePath) {
		out.push(`Workspace: ${opts.workspacePath}`);
	}
	out.push(`Exported: ${exportedAt.toISOString()}`);
	out.push(`Transcript messages: ${opts.messages.length}`);
	out.push(`Tool results indexed: ${toolResults.size}`);
	if (opts.uiStats) {
		out.push(
			`Tokens (in/out/ctx): ${opts.uiStats.totalIn} / ${opts.uiStats.totalOut} / ${opts.uiStats.ctx}`,
		);
	}
	out.push('');
	out.push(
		'Chronological export: each assistant tool call is followed immediately by its result (execution order).',
	);
	out.push(
		'Includes phases, reflections, plan updates (todo_write, internal_plan_write), executor delegations (delegate_executor), gate errors, and engine system blocks when present.',
	);
	if (includeEngineContext) {
		out.push('Engine context mode: internal plan + full system blocks (dev export).');
	}

	for (const m of opts.messages) {
		if (m.role === 'tool') {
			continue;
		}
		step.value += 1;
		pushDroxExportStepSeparator(out, step.value, roleLabel(m.role));
		const blocks = Array.isArray(m.content) ? m.content : [];

		if (m.role === 'user') {
			formatUserSections(joinTextBlocks(blocks), out);
			continue;
		}
		if (m.role === 'system') {
			const text = joinTextBlocks(blocks);
			if (!includeEngineContext && text.includes(INTERNAL_WORK_PLAN_MARKER)) {
				out.push('(internal engine plan — omitted from user export)');
				out.push('');
				continue;
			}
			formatSystemText(text, maxSystem, out, includeEngineContext);
			continue;
		}
		if (m.role === 'assistant') {
			if (blocks.length === 0) {
				out.push('(empty)');
				out.push('');
			} else {
				formatAssistantBlocksChronological(
					blocks,
					toolResults,
					consumed,
					maxToolResult,
					maxDelegateReport,
					out,
					includeEngineContext,
				);
			}
		}
	}

	emitOrphanToolResults(
		opts.messages,
		consumed,
		maxToolResult,
		maxDelegateReport,
		out,
		step,
		includeEngineContext,
	);

	out.push('');
	out.push(`— end of export (${step.value} steps) —`);
	return out.join('\n');
}

export interface IDroxExecutionSummary {
	readonly toolCallCount: number;
	readonly toolErrorCount: number;
	readonly finalPhase: string | undefined;
	readonly firstStructuredToolMessageIndex: number | undefined;
}

/** Compteurs outils / phase depuis le journal UI (PARTIE A). */
export function computeDroxUiJournalToolStats(
	journal: readonly Record<string, unknown>[],
): Pick<IDroxExecutionSummary, 'toolCallCount' | 'toolErrorCount' | 'finalPhase'> {
	let toolCallCount = 0;
	let toolErrorCount = 0;
	let finalPhase: string | undefined;
	for (const entry of journal) {
		const kind = typeof entry.kind === 'string' ? entry.kind : '';
		if (kind === 'tool') {
			const phase = typeof entry.phase === 'string' ? entry.phase : '';
			if (phase === 'start') {
				toolCallCount += 1;
			} else if (phase === 'finish' && entry.isError === true) {
				toolErrorCount += 1;
			}
		} else if (kind === 'phase' && entry.close !== true) {
			const phase = typeof entry.phase === 'string' ? entry.phase : '';
			if (phase) {
				finalPhase = phase;
			}
		}
	}
	return { toolCallCount, toolErrorCount, finalPhase };
}

/** Index 0-based du premier message assistant avec `tool_use` structuré. */
export function findFirstStructuredToolMessageIndex(
	messages: readonly IDroxTranscriptMessage[],
): number | undefined {
	for (let i = 0; i < messages.length; i++) {
		const m = messages[i];
		if (m.role !== 'assistant') {
			continue;
		}
		const blocks = Array.isArray(m.content) ? m.content : [];
		if (blocks.some(b => b.type === 'tool_use')) {
			return i;
		}
	}
	return undefined;
}

export function formatDroxPartieASummaryBlock(
	summary: IDroxExecutionSummary & {
		readonly textToolMarkerStreak?: number;
		readonly schemaErrorContinueCount?: number;
		readonly llmIterations?: number;
	},
): string {
	const firstToolIdx =
		summary.firstStructuredToolMessageIndex !== undefined
			? String(summary.firstStructuredToolMessageIndex)
			: '(aucun)';
	const lines = [
		`Tool calls (journal UI): ${summary.toolCallCount}`,
		`Tool errors (journal UI): ${summary.toolErrorCount}`,
		`Phase finale (journal UI): ${summary.finalPhase ?? '(aucune)'}`,
		`1er tool structuré (index message moteur): ${firstToolIdx}`,
	];
	if (summary.textToolMarkerStreak !== undefined) {
		lines.push(`text_tool_marker_streak (engine): ${summary.textToolMarkerStreak}`);
	}
	if (summary.schemaErrorContinueCount !== undefined) {
		lines.push(`schema_error_continue_count (engine): ${summary.schemaErrorContinueCount}`);
	}
	if (summary.llmIterations !== undefined) {
		lines.push(`LLM iterations (engine): ${summary.llmIterations}`);
	}
	return lines.join('\n');
}

/** Index compact de tous les messages moteur (y compris role `tool`). */
export function formatDroxEngineMessageRoster(messages: readonly IDroxTranscriptMessage[]): string {
	const out: string[] = [];
	out.push(`Messages moteur indexés: ${messages.length}`);
	out.push(
		'Les messages `tool` sont fusionnés dans la chronologie Partie B ; cet index liste tout le fichier session.',
	);
	out.push('');
	for (let i = 0; i < messages.length; i++) {
		const m = messages[i];
		const blocks = Array.isArray(m.content) ? m.content : [];
		const summary = blocks
			.map(b => {
				if (b.type === 'tool_use') {
					return `tool_use:${typeof b.name === 'string' ? b.name : '?'}`;
				}
				if (b.type === 'tool_result') {
					return `tool_result:${typeof b.tool_use_id === 'string' ? b.tool_use_id : '?'}`;
				}
				if (b.type === 'text' || b.type === 'thinking' || b.type === 'internal_reasoning') {
					const t = typeof b.text === 'string' ? b.text : '';
					return `${b.type}(${t.length}c)`;
				}
				return b.type;
			})
			.join(', ') || '(vide)';
		out.push(`${String(i + 1).padStart(3)}. ${m.role.toUpperCase()} — ${summary}`);
	}
	return out.join('\n');
}
