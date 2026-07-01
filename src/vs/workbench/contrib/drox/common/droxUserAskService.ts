/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IChatProgress, IChatQuestionAnswers } from '../../chat/common/chatService/chatService.js';
import { DroxUserAskHostMessage } from './droxUserAsk.js';

export const IDroxUserAskService = createDecorator<IDroxUserAskService>('droxUserAskService');

export interface IDroxUserAskService {

	readonly _serviceBrand: undefined;

	readonly onDidChangePending: Event<boolean>;

	readonly hasPending: boolean;

	attachWebview(post: (message: DroxUserAskHostMessage) => void): void;

	/** Fenêtre Agents : émet `questionCarousel` dans le fil chat natif. */
	attachAgentsProgress(progress: ((parts: IChatProgress[]) => void) | undefined): void;

	handleWebviewAnswer(raw: unknown): void;

	/** Réponses du carousel natif Agents (`resolveId` = `askId`). */
	handleQuestionCarouselAnswer(resolveId: string, answers: IChatQuestionAnswers | undefined): void;

	resolvePendingAsSkipped(): void;

	/** Mode permission du run agent en cours (pour auto-allow en Accept Edit). */
	setActivePermissionMode(mode: string | undefined): void;

	getActivePermissionMode(): string | undefined;

}


