/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Notification text shown as-is, without markdown link parsing.
 */
export class NotificationText {
	private constructor(private readonly parts: readonly string[]) { }

	static concat(...parts: readonly string[]): NotificationText {
		return new NotificationText(parts);
	}

	toString(): string {
		return this.parts.join('');
	}
}
