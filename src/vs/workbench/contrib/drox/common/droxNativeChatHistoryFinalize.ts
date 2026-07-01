/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { ChatResponseModel, IChatModel } from '../../chat/common/model/chatModel.js';

/** Marque les réponses rechargées comme terminées pour un rendu fil historique correct. */
export function finalizeDroxNativeChatHistoryModel(model: IChatModel): void {
	for (const request of model.getRequests()) {
		const response = request.response;
		if (response instanceof ChatResponseModel && !response.isComplete) {
			response.complete();
		}
	}
}
