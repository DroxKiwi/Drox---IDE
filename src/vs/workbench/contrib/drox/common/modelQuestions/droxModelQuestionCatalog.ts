/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDroxModelQuestionVariant } from './droxModelQuestionTypes.js';
import { CODEBASE_RETRIEVAL_COMPREHENSION_VARIANTS } from './questions/codebaseRetrievalComprehension.js';

const ALL_VARIANTS: readonly IDroxModelQuestionVariant[] = [
	...CODEBASE_RETRIEVAL_COMPREHENSION_VARIANTS,
];

/** All registered variants (flat). Prefer {@link listDroxModelQuestionVariants}. */
export function listAllDroxModelQuestionVariants(): readonly IDroxModelQuestionVariant[] {
	return ALL_VARIANTS;
}

export function listDroxModelQuestionVariants(questionId: IDroxModelQuestionVariant['questionId']): readonly IDroxModelQuestionVariant[] {
	return ALL_VARIANTS.filter(v => v.questionId === questionId);
}

export function getDroxModelQuestionVariant(
	questionId: IDroxModelQuestionVariant['questionId'],
	variantId: string,
): IDroxModelQuestionVariant | undefined {
	return ALL_VARIANTS.find(v => v.questionId === questionId && v.variantId === variantId);
}

export function defaultDroxModelQuestionVariantId(questionId: IDroxModelQuestionVariant['questionId']): string {
	const list = listDroxModelQuestionVariants(questionId);
	return list[0]?.variantId ?? 'v1';
}

export function renderDroxModelQuestionUser(variant: IDroxModelQuestionVariant, userMessage: string): string {
	return variant.userTemplate.split('{{userMessage}}').join(userMessage);
}
