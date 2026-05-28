/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Diff unifié simplifié (ligne à ligne) pour les réponses outils. */

export function unifiedDiff(pathLabel: string, before: string, after: string): string {

	const lines: string[] = [`--- ${pathLabel}`, `+++ ${pathLabel}`];

	const bLines = before.split(/\r?\n/);

	const aLines = after.split(/\r?\n/);

	const max = Math.max(bLines.length, aLines.length);

	for (let i = 0; i < max; i++) {

		const bl = bLines[i];

		const al = aLines[i];

		if (bl === al) {

			if (bl !== undefined) {

				lines.push(` ${bl}`);

			}

		} else {

			if (bl !== undefined) {

				lines.push(`-${bl}`);

			}

			if (al !== undefined) {

				lines.push(`+${al}`);

			}

		}

	}

	return lines.join('\n');

}


