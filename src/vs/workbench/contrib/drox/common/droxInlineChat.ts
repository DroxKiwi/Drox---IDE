/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { buildLlmChatUrl, type DroxLlmProviderId } from './droxLlmCatalog.js';

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
	readonly fetchHttp: (
		url: string,
		headers?: Record<string, string>,
		options?: { method?: 'GET' | 'POST'; body?: string; timeoutMs?: number },
	) => Promise<{ statusCode: number; body: string }>;
}

/** One-shot prose completion. No JSON mode, no agent run. */
export async function callDroxProseLlm(deps: IDroxProseLlmDeps, system: string, user: string): Promise<string> {
	const target = buildLlmChatUrl(deps.provider, deps.server);
	const url = Object.hasOwn(target, 'url') ? (target as { readonly url: string }).url : undefined;
	if (!url || !deps.model.trim()) {
		return '';
	}
	const body = JSON.stringify({
		model: deps.model,
		stream: false,
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: user },
		],
	});
	const res = await deps.fetchHttp(url, {
		'Content-Type': 'application/json',
		...(deps.headers ?? {}),
	}, { method: 'POST', body, timeoutMs: 60_000 });
	if (!res.statusCode || res.statusCode >= 400) {
		throw new Error(`HTTP ${res.statusCode || 0}`);
	}
	return extractAssistantText(deps.provider, res.body)?.trim() ?? '';
}

function extractAssistantText(provider: DroxLlmProviderId, body: string): string | undefined {
	try {
		const json = JSON.parse(body) as Record<string, unknown>;
		if (provider === 'ollama') {
			const msg = json.message as { content?: string } | undefined;
			return typeof msg?.content === 'string' ? msg.content : undefined;
		}
		const choices = json.choices as Array<{ message?: { content?: string } }> | undefined;
		const content = choices?.[0]?.message?.content;
		return typeof content === 'string' ? content : undefined;
	} catch {
		return undefined;
	}
}
