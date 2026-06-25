/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

export interface IDroxUserAskOption {

	readonly id: string;

	readonly label: string;

}



export interface IDroxUserAskQuestion {

	readonly id: string;

	readonly prompt: string;

	readonly options: IDroxUserAskOption[];

	readonly allowMultiple: boolean;

	readonly allowFreeText: boolean;

}



export interface IDroxUserAskPayload {

	readonly askId: string;

	readonly runId: string;

	readonly title: string | null;

	readonly questions: IDroxUserAskQuestion[];

}



export interface IDroxUserAskAnswer {

	readonly id: string;

	readonly optionIds: string[];

	readonly freeText: string;

	readonly skipped: boolean;

}



export interface IDroxUserAskAnswerMessage {

	readonly type: 'userAskAnswer';

	readonly askId: string;

	readonly answers: IDroxUserAskAnswer[];

}

/** Messages hôte → webview pour la carte Questions (I-17). */
export type DroxUserAskHostMessage =
	| {
		readonly kind: 'userAsk';
		readonly askId: string;
		readonly runId: string;
		readonly title: string | null;
		readonly questions: IDroxUserAskQuestion[];
	}
	| { readonly kind: 'userAskClose' };

export function parseUserAskParams(params: unknown): IDroxUserAskPayload | { error: string } {

	const p = (params ?? {}) as {

		runId?: string;

		askId?: string;

		title?: string;

		questions?: string | Array<{

			id?: string;

			prompt?: string;

			options?: Array<{ id?: string; label?: string }>;

			allowMultiple?: boolean;

			allowFreeText?: boolean;

		}>;

	};

	const askId = typeof p.askId === 'string' ? p.askId : '';

	const rawQuestions = normalizeRawUserAskQuestions(p.questions);

	if (!askId || rawQuestions.length === 0) {

		return { error: 'user/ask params must include `askId` and a non-empty `questions[]`' };

	}

	const questions = rawQuestions.map((q, i) => ({

		id: typeof q.id === 'string' && q.id ? q.id : `q${i + 1}`,

		prompt: typeof q.prompt === 'string' ? q.prompt : '',

		options: Array.isArray(q.options)

			? q.options.map((o, j) => ({

				id: typeof o.id === 'string' && o.id ? o.id : `opt${j + 1}`,

				label: typeof o.label === 'string' ? o.label : '',

			}))

			: [],

		allowMultiple: Boolean(q.allowMultiple),

		allowFreeText: Boolean(q.allowFreeText),

	}));

	return {

		askId,

		runId: typeof p.runId === 'string' ? p.runId : '',

		title: typeof p.title === 'string' ? p.title : null,

		questions: coerceUserAskQuestions(questions),

	};

}

function tryParseJsonText(s: string): unknown | undefined {
	const t = s.trim();
	if (!t.startsWith('[') && !t.startsWith('{')) {
		return undefined;
	}
	try {
		return JSON.parse(t);
	} catch {
		return undefined;
	}
}

type RawUserAskQuestionInput = {
	id?: string;
	prompt?: string;
	options?: Array<{ id?: string; label?: string }>;
	allowMultiple?: boolean;
	allowFreeText?: boolean;
};

/** Aligné avec `questions_value_from_string` côté moteur Rust. */
export function normalizeRawUserAskQuestions(
	questions: string | RawUserAskQuestionInput[] | undefined
): RawUserAskQuestionInput[] {
	if (Array.isArray(questions)) {
		return questions;
	}
	if (typeof questions !== 'string') {
		return [];
	}
	const parsed = tryParseJsonText(questions);
	if (Array.isArray(parsed)) {
		return parsed.filter((item): item is RawUserAskQuestionInput => !!item && typeof item === 'object');
	}
	if (parsed && typeof parsed === 'object') {
		return [parsed as RawUserAskQuestionInput];
	}
	return [{ prompt: questions }];
}

function coerceQuestionItem(raw: {
	id?: string;
	prompt?: string;
	options?: Array<{ id?: string; label?: string }>;
	allowMultiple?: boolean;
	allowFreeText?: boolean;
}, index: number): IDroxUserAskQuestion[] {
	const prompt = typeof raw.prompt === 'string' ? raw.prompt : '';
	const parsed = tryParseJsonText(prompt);
	if (parsed !== undefined) {
		if (Array.isArray(parsed)) {
			const out: IDroxUserAskQuestion[] = [];
			for (let i = 0; i < parsed.length; i++) {
				const item = parsed[i];
				if (item && typeof item === 'object') {
					out.push(...coerceQuestionItem(item as typeof raw, index + i));
				} else if (typeof item === 'string' && item.trim()) {
					out.push({
						id: `q${index + i + 1}`,
						prompt: item.trim(),
						options: [],
						allowMultiple: false,
						allowFreeText: true,
					});
				}
			}
			if (out.length > 0) {
				return out;
			}
		} else if (parsed && typeof parsed === 'object') {
			return coerceQuestionItem(parsed as typeof raw, index);
		}
	}
	const options = Array.isArray(raw.options)
		? raw.options.map((o, j) => ({
			id: typeof o.id === 'string' && o.id ? o.id : `opt${j + 1}`,
			label: typeof o.label === 'string' ? o.label : '',
		}))
		: [];
	return [{
		id: typeof raw.id === 'string' && raw.id ? raw.id : `q${index + 1}`,
		prompt,
		options,
		allowMultiple: Boolean(raw.allowMultiple),
		allowFreeText: Boolean(raw.allowFreeText) || options.length === 0,
	}];
}

/** Déplie les payloads mal formés (JSON stringifié dans `prompt`, etc.). */
export function coerceUserAskQuestions(questions: IDroxUserAskQuestion[]): IDroxUserAskQuestion[] {
	const out: IDroxUserAskQuestion[] = [];
	for (let i = 0; i < questions.length; i++) {
		out.push(...coerceQuestionItem(questions[i], i));
	}
	return out.length > 0 ? out : questions;
}


