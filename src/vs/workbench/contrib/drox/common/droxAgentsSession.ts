/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { encodeBase64, VSBuffer, decodeBase64 } from '../../../../base/common/buffer.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ISessionType } from '../../../../sessions/services/sessions/common/session.js';

/** Chat session type / URI authority for Drox Agents window. */
export const DROX_CHAT_SESSION_TYPE = 'drox';

export const DROX_SESSIONS_PROVIDER_ID = 'drox';

export const DROX_AGENT_ID = 'drox';

export const DroxSessionType: ISessionType = {
	id: DROX_CHAT_SESSION_TYPE,
	label: localize('droxSessionType', 'Drox'),
	icon: Codicon.sparkle,
	chatSessionType: DROX_CHAT_SESSION_TYPE,
};

export namespace DroxChatSessionUri {

	export const scheme = Schemas.vscodeLocalChatSession;

	export function forSession(sessionId: string): URI {
		const encodedId = encodeBase64(VSBuffer.wrap(new TextEncoder().encode(sessionId)), false, true);
		return URI.from({ scheme, authority: DROX_CHAT_SESSION_TYPE, path: '/' + encodedId });
	}

	export function parseSessionId(resource: URI): string | undefined {
		if (resource.scheme !== scheme || resource.authority !== DROX_CHAT_SESSION_TYPE) {
			return undefined;
		}
		const parts = resource.path.split('/');
		if (parts.length !== 2 || !parts[1]) {
			return undefined;
		}
		try {
			const decoded = decodeBase64(parts[1]);
			return new TextDecoder().decode(decoded.buffer) || undefined;
		} catch {
			return undefined;
		}
	}

	export function isDroxSession(resource: URI): boolean {
		return !!parseSessionId(resource);
	}
}
