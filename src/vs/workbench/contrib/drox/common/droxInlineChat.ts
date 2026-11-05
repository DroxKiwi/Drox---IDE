/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buildLlmChatUrl, normalizeLlmServerBaseUrl, type DroxLlmProviderId } from './droxLlmCatalog.js';

export const DROX_INLINE_SNIPPET_MAX_CHARS = 6000;

export const DROX_EXPLAIN_SYSTEM_PROMPT = `Tu expliques uniquement le fragment de code qu'on te donne. Tu n'as pas le fichier autour. N'invente pas d'appelant, d'import ou de type qui n'est pas dans le fragment.

Réponds en français, uniquement par des lignes, une construction du fragment par ligne, dans l'ordre de lecture. Aucun titre, aucun préambule, aucune phrase hors de ce format :
extrait | rôle | explication

- extrait : le morceau tel qu'il est écrit (un nom, un appel, un opérateur, un mot-clé).
- rôle : un seul groupe court : variable, constante, paramètre, fonction, appel, appel natif, littéral, opérateur, condition, boucle, retour.
- explication : une phrase. Dis ce que c'est, puis ce que ce fragment en fait. Si un appel est une fonction native et que le fragment le montre, le rôle est « appel natif ».

Exemple pour x = len(items) :
x | variable | Déclarée pour recevoir le résultat de l'appel.
= | opérateur | Affecte la valeur de droite à x.
len | appel natif | Fonction native qui renvoie le nombre d'éléments.
items | variable | Argument passé à len. Son origine n'est pas dans le fragment.`;

export const DROX_INLINE_CHAT_SYSTEM_PROMPT = `Tu es le chat inline de Drox, dans l'éditeur. Tu réponds à la question de l'utilisateur sur le fragment sélectionné. Tu n'as pas le reste du fichier. N'invente pas d'appelant, d'import ou de type absent du fragment. Réponds dans la langue de la question, de façon courte et concrète. Pas d'appel d'outil.`;

export function clipDroxInlineSnippet(snippet: string): { readonly text: string; readonly truncated: boolean } {
	const trimmed = snippet.trim();
	if (trimmed.length <= DROX_INLINE_SNIPPET_MAX_CHARS) {
		return { text: trimmed, truncated: false };
	}
	return { text: trimmed.slice(0, DROX_INLINE_SNIPPET_MAX_CHARS), truncated: true };
}

export function buildDroxExplainUserMessage(languageId: string, snippet: string): string {
	const clip = clipDroxInlineSnippet(snippet);
	const note = clip.truncated ? '\n\n(fragment tronqué)' : '';
	return `langage: ${languageId || 'text'}\n\n\`\`\`${languageId || ''}\n${clip.text}\n\`\`\`${note}`;
}

export interface IDroxExplainPart {
	readonly code: string;
	readonly role: string;
	readonly text: string;
}

/** Lines `extrait | rôle | explication`. Other lines are ignored. */
export function parseDroxExplainParts(raw: string): IDroxExplainPart[] {
	const parts: IDroxExplainPart[] = [];
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim().replace(/^[-*]\s+/, '');
		const bits = trimmed.split('|').map(bit => bit.trim());
		if (bits.length < 3) {
			continue;
		}
		const code = bits[0].replace(/^`+|`+$/g, '');
		const role = bits[1];
		const text = bits.slice(2).join(' | ').trim();
		if (!code || !role || !text) {
			continue;
		}
		parts.push({ code, role, text });
	}
	return parts;
}

/** Line or block comment placed above the selection. */
export function formatDroxExplainComment(languageId: string, explanation: string): string {
	const parts = parseDroxExplainParts(explanation);
	const lines = (parts.length
		? parts.map(part => `${part.code} — ${part.role} : ${part.text}`)
		: explanation.trim().split(/\r?\n/)
	).map(line => line.trimEnd());
	const lang = languageId.toLowerCase();
	if (['html', 'xml', 'svg'].includes(lang)) {
		return `<!--\n${lines.join('\n')}\n-->\n`;
	}
	if (['css', 'scss', 'less'].includes(lang)) {
		return `/*\n${lines.join('\n')}\n*/\n`;
	}
	const prefix = hashComment(lang) ? '# ' : sqlComment(lang) ? '-- ' : '// ';
	return lines.map(line => line.length ? `${prefix}${line}` : prefix.trimEnd()).join('\n') + '\n';
}

function hashComment(lang: string): boolean {
	return ['python', 'ruby', 'shellscript', 'shell', 'yaml', 'toml', 'r', 'perl', 'powershell', 'dockerfile'].includes(lang);
}

function sqlComment(lang: string): boolean {
	return ['sql', 'lua', 'haskell'].includes(lang);
}

export function buildDroxInlineChatUserMessage(languageId: string, snippet: string, question: string): string {
	const clip = clipDroxInlineSnippet(snippet);
	const code = clip.text
		? `langage: ${languageId || 'text'}\n\n\`\`\`${languageId || ''}\n${clip.text}\n\`\`\`${clip.truncated ? '\n(fragment tronqué)' : ''}\n\n`
		: '';
	return `${code}question:\n${question.trim()}`;
}

export interface IDroxProseLlmDeps {
	readonly provider: DroxLlmProviderId;
	readonly server: string;
	readonly model: string;
	readonly headers?: Record<string, string>;
	/** Ask this call for the shortest thinking the provider allows. */
	readonly disableThinking?: boolean;
	/** When set, sent as `temperature` so repeated calls stay close. */
	readonly temperature?: number;
	readonly fetchHttp: (
		url: string,
		headers?: Record<string, string>,
		options?: { method?: 'GET' | 'POST'; body?: string; timeoutMs?: number },
	) => Promise<{ statusCode: number; body: string }>;
}

export interface IDroxLlmMessageChannels {
	readonly content: string;
	readonly reasoning: string;
}

/** Visible answer and reasoning, for every catalog provider. */
export function readDroxLlmMessageChannels(provider: DroxLlmProviderId, body: string): IDroxLlmMessageChannels {
	try {
		const json = JSON.parse(body) as Record<string, unknown>;
		if (provider === 'ollama') {
			const message = recordOf(json.message);
			return {
				content: textOf(message?.content),
				reasoning: joinText(textOf(message?.thinking), textOf(message?.reasoning)),
			};
		}
		const choices = Array.isArray(json.choices) ? json.choices : [];
		const first = recordOf(choices[0]);
		const message = recordOf(first?.message);
		const parts = splitContentParts(message?.content);
		return {
			content: parts.content,
			reasoning: joinText(parts.reasoning, textOf(message?.reasoning_content), textOf(message?.reasoning), textOf(message?.thinking)),
		};
	} catch {
		return { content: '', reasoning: '' };
	}
}

/** One-shot prose completion. No JSON mode, no agent run. The visible text only. */
export async function callDroxProseLlm(deps: IDroxProseLlmDeps, system: string, user: string, timeoutMs = 60_000): Promise<string> {
	return (await callDroxProseLlmChannels(deps, system, user, timeoutMs)).content;
}

/** Same call as {@link callDroxProseLlm}, keeping the reasoning channel beside the visible text. */
export async function callDroxProseLlmChannels(deps: IDroxProseLlmDeps, system: string, user: string, timeoutMs = 60_000): Promise<IDroxLlmMessageChannels> {
	const target = buildLlmChatUrl(deps.provider, deps.server);
	const url = Object.hasOwn(target, 'url') ? (target as { readonly url: string }).url : undefined;
	if (!url || !deps.model.trim()) {
		return { content: '', reasoning: '' };
	}
	const payload: Record<string, unknown> = {
		model: deps.model,
		stream: false,
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: user },
		],
	};
	if (typeof deps.temperature === 'number') {
		payload.temperature = deps.temperature;
	}
	if (deps.disableThinking) {
		const think = deps.provider === 'ollama' ? await ollamaQuietThink(deps) : false;
		Object.assign(payload, quietThinkingFields(deps.provider, think));
	}
	const body = JSON.stringify(payload);
	const res = await deps.fetchHttp(url, {
		'Content-Type': 'application/json',
		...(deps.headers ?? {}),
	}, { method: 'POST', body, timeoutMs });
	if (!res.statusCode || res.statusCode >= 400) {
		throw new Error(`HTTP ${res.statusCode || 0}`);
	}
	return readDroxLlmMessageChannels(deps.provider, res.body);
}

const OLLAMA_THINK_RANK = ['none', 'minimal', 'low', 'medium', 'high', 'max', 'xhigh'];
const ollamaThinkCache = new Map<string, boolean | string>();

/**
 * Quietest `think` value advertised by `/api/show`.
 * `false` wins. Otherwise the lowest named level (`low` before `max`).
 * An unknown list still asks for `false`.
 */
export function quietestOllamaThink(values: unknown): boolean | string {
	if (!Array.isArray(values) || values.length === 0) {
		return false;
	}
	if (values.some(value => value === false)) {
		return false;
	}
	let best: { readonly name: string; readonly rank: number } | undefined;
	for (const value of values) {
		if (typeof value !== 'string') {
			continue;
		}
		const name = value.trim();
		const rank = OLLAMA_THINK_RANK.indexOf(name.toLowerCase());
		if (rank < 0) {
			continue;
		}
		if (!best || rank < best.rank) {
			best = { name, rank };
		}
	}
	return best?.name ?? false;
}

/**
 * Fields that shorten thinking without a key the provider rejects.
 * Mistral, Scaleway and OVHcloud reject unknown keys, so they get none.
 * vLLM, LM Studio, Hugging Face and OpenAI-compatible get `enable_thinking: false`.
 */
export function quietThinkingFields(provider: DroxLlmProviderId, ollamaThink: boolean | string = false): Record<string, unknown> {
	if (provider === 'ollama') {
		return { think: ollamaThink };
	}
	if (provider === 'mistral' || provider === 'scaleway' || provider === 'ovhcloud') {
		return {};
	}
	return { chat_template_kwargs: { enable_thinking: false } };
}

async function ollamaQuietThink(deps: IDroxProseLlmDeps): Promise<boolean | string> {
	const base = normalizeLlmServerBaseUrl(deps.server);
	const model = deps.model.trim();
	if (!base || !model) {
		return false;
	}
	const key = `${base}\n${model}`;
	const cached = ollamaThinkCache.get(key);
	if (cached !== undefined) {
		return cached;
	}
	let chosen: boolean | string = false;
	try {
		const res = await deps.fetchHttp(`${base}/api/show`, {
			'Content-Type': 'application/json',
			...(deps.headers ?? {}),
		}, { method: 'POST', body: JSON.stringify({ model }), timeoutMs: 20_000 });
		if (res.statusCode && res.statusCode < 400) {
			const json = JSON.parse(res.body) as Record<string, unknown>;
			const thinking = recordOf(json.thinking);
			chosen = quietestOllamaThink(thinking?.values);
		}
	} catch {
		chosen = false;
	}
	ollamaThinkCache.set(key, chosen);
	return chosen;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function textOf(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function joinText(...parts: readonly string[]): string {
	return parts.map(part => part.trim()).filter(part => part.length > 0).join('\n');
}

function splitContentParts(value: unknown): IDroxLlmMessageChannels {
	if (typeof value === 'string') {
		return { content: value.trim(), reasoning: '' };
	}
	if (!Array.isArray(value)) {
		return { content: '', reasoning: '' };
	}
	const content: string[] = [];
	const reasoning: string[] = [];
	for (const part of value) {
		if (typeof part === 'string') {
			content.push(part);
			continue;
		}
		const record = recordOf(part);
		if (!record) {
			continue;
		}
		const text = textOf(record.text) || textOf(record.content);
		if (!text) {
			continue;
		}
		const type = textOf(record.type);
		if (type === 'reasoning' || type === 'thinking' || type === 'reasoning_text') {
			reasoning.push(text);
		} else {
			content.push(text);
		}
	}
	return { content: joinText(...content), reasoning: joinText(...reasoning) };
}
