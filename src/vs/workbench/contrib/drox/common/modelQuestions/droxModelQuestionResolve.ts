/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	defaultDroxModelQuestionVariantId,
	getDroxModelQuestionVariant,
	listDroxModelQuestionVariants,
} from './droxModelQuestionCatalog.js';
import { DroxModelQuestionId, IDroxModelQuestionResolveOpts, IDroxModelQuestionVariant } from './droxModelQuestionTypes.js';

/**
 * Pick a question variant. Later: map modelId / scores (1.5.22) → variant.
 * Today: explicit override, else catalog default (`v1`).
 */
export function resolveDroxModelQuestionVariant(
	questionId: DroxModelQuestionId,
	opts?: IDroxModelQuestionResolveOpts,
): IDroxModelQuestionVariant {
	if (opts?.variantId) {
		const hit = getDroxModelQuestionVariant(questionId, opts.variantId);
		if (hit) {
			return hit;
		}
	}
	const def = defaultDroxModelQuestionVariantId(questionId);
	const variant = getDroxModelQuestionVariant(questionId, def) ?? listDroxModelQuestionVariants(questionId)[0];
	if (!variant) {
		throw new Error(`[drox-model-questions] no variants for ${questionId}`);
	}
	return variant;
}
