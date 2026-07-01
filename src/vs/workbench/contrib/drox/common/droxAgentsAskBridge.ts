/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { MarkdownString } from '../../../../base/common/htmlContent.js';
import {
	IChatQuestion,
	IChatQuestionAnswers,
	IChatQuestionAnswerValue,
	IChatQuestionCarousel,
	IChatMultiSelectAnswer,
	IChatSingleSelectAnswer,
} from '../../chat/common/chatService/chatService.js';
import { IDroxUserAskAnswer, IDroxUserAskPayload, IDroxUserAskQuestion } from './droxUserAsk.js';

export function droxUserAskToQuestionCarousel(parsed: IDroxUserAskPayload): IChatQuestionCarousel {
	return {
		kind: 'questionCarousel',
		resolveId: parsed.askId,
		allowSkip: true,
		message: parsed.title ? new MarkdownString(parsed.title) : undefined,
		questions: parsed.questions.map(toChatQuestion),
	};
}

function toChatQuestion(q: IDroxUserAskQuestion): IChatQuestion {
	if (q.options.length === 0) {
		return {
			id: q.id,
			type: 'text',
			title: q.prompt,
			required: true,
			allowFreeformInput: q.allowFreeText,
		};
	}
	if (q.allowMultiple) {
		return {
			id: q.id,
			type: 'multiSelect',
			title: q.prompt,
			required: true,
			options: q.options.map(o => ({ id: o.id, label: o.label, value: o.id })),
			allowFreeformInput: q.allowFreeText,
		};
	}
	return {
		id: q.id,
		type: 'singleSelect',
		title: q.prompt,
		required: true,
		options: q.options.map(o => ({ id: o.id, label: o.label, value: o.id })),
		allowFreeformInput: q.allowFreeText,
	};
}

export function questionCarouselAnswersToDroxUserAsk(
	questions: readonly IDroxUserAskQuestion[],
	answers: IChatQuestionAnswers | undefined,
): IDroxUserAskAnswer[] {
	const byId = answers ?? {};
	return questions.map(q => {
		const raw = byId[q.id];
		if (raw === undefined) {
			return { id: q.id, optionIds: [], freeText: '', skipped: true };
		}
		return convertOneAnswer(q, raw);
	});
}

function convertOneAnswer(q: IDroxUserAskQuestion, raw: IChatQuestionAnswerValue): IDroxUserAskAnswer {
	if (typeof raw === 'string') {
		return { id: q.id, optionIds: [], freeText: raw, skipped: false };
	}
	const validIds = new Set(q.options.map(o => o.id));
	if (isMultiSelectAnswer(raw)) {
		const optionIds = raw.selectedValues.filter(id => validIds.has(id));
		return {
			id: q.id,
			optionIds,
			freeText: raw.freeformValue ?? '',
			skipped: optionIds.length === 0 && !raw.freeformValue,
		};
	}
	if (isSingleSelectAnswer(raw)) {
		const optionIds = raw.selectedValue && validIds.has(raw.selectedValue) ? [raw.selectedValue] : [];
		return {
			id: q.id,
			optionIds,
			freeText: raw.freeformValue ?? '',
			skipped: optionIds.length === 0 && !raw.freeformValue,
		};
	}
	return { id: q.id, optionIds: [], freeText: '', skipped: true };
}

function isSingleSelectAnswer(v: IChatQuestionAnswerValue): v is IChatSingleSelectAnswer {
	return typeof v === 'object' && v !== null && 'selectedValue' in v;
}

function isMultiSelectAnswer(v: IChatQuestionAnswerValue): v is IChatMultiSelectAnswer {
	return typeof v === 'object' && v !== null && 'selectedValues' in v;
}
