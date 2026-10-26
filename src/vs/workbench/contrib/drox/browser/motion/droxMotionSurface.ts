/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/**
 * Surfaces where Drox motion effects may run.
 * IDE and Agent stay separate so each can evolve its own motion language.
 */
export const enum DroxMotionSurface {
	Ide = 'ide',
	Agent = 'agent',
}
