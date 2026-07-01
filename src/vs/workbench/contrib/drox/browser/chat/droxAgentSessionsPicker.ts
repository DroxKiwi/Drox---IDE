/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { sessionDateFromNow } from '../../../chat/browser/agentSessions/agentSessionsViewer.js';
import { formatDroxSessionListLabel } from '../../common/droxNativeChatSessionResolver.js';
import { IDroxSessionListEntry } from '../../common/droxSession.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

interface IDroxSessionPickItem extends IQuickPickItem {
	readonly sessionId: string;
}

interface IDroxSessionDateGroup {
	readonly label: string;
	readonly entries: readonly IDroxSessionListEntry[];
}

function groupDroxSessionsByDate(entries: readonly IDroxSessionListEntry[]): IDroxSessionDateGroup[] {
	const now = Date.now();
	const startOfToday = new Date(now).setHours(0, 0, 0, 0);
	const startOfYesterday = startOfToday - DAY_MS;

	const today: IDroxSessionListEntry[] = [];
	const yesterday: IDroxSessionListEntry[] = [];
	const week: IDroxSessionListEntry[] = [];
	const older: IDroxSessionListEntry[] = [];

	for (const entry of entries) {
		const t = entry.modifiedSecs * 1000;
		if (t >= startOfToday) {
			today.push(entry);
		} else if (t >= startOfYesterday) {
			yesterday.push(entry);
		} else if (t >= now - WEEK_MS) {
			week.push(entry);
		} else {
			older.push(entry);
		}
	}

	const groups: IDroxSessionDateGroup[] = [];
	if (today.length) {
		groups.push({ label: localize('drox.agentSessions.today', 'Today'), entries: today });
	}
	if (yesterday.length) {
		groups.push({ label: localize('drox.agentSessions.yesterday', 'Yesterday'), entries: yesterday });
	}
	if (week.length) {
		groups.push({ label: localize('drox.agentSessions.week', 'Last 7 days'), entries: week });
	}
	if (older.length) {
		groups.push({ label: localize('drox.agentSessions.older', 'Older'), entries: older });
	}
	return groups;
}

function toPickItem(entry: IDroxSessionListEntry): IDroxSessionPickItem {
	const label = formatDroxSessionListLabel(entry);
	const timeAgo = sessionDateFromNow(entry.modifiedSecs * 1000);
	return {
		label,
		description: timeAgo,
		iconClass: ThemeIcon.asClassName(Codicon.sparkle),
		sessionId: entry.id,
	};
}

export type DroxAgentSessionsPickHandler = (sessionId: string) => void | Promise<void>;

/** Sélecteur de sessions Drox (groupement date style Copilot / fenêtre Agents). */
export class DroxAgentSessionsPicker {

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) { }

	async pickSession(
		entries: readonly IDroxSessionListEntry[],
		onPick: DroxAgentSessionsPickHandler,
	): Promise<void> {
		if (entries.length === 0) {
			return;
		}

		const disposables = new DisposableStore();
		const picker = disposables.add(this.quickInputService.createQuickPick<IDroxSessionPickItem>({ useSeparators: true }));
		picker.placeholder = localize('drox.agentSessions.pickPlaceholder', 'Search Drox chat sessions');
		picker.matchOnDescription = true;
		picker.items = this._buildItems(entries);

		disposables.add(picker.onDidAccept(async () => {
			const item = picker.selectedItems[0];
			if (item) {
				await onPick(item.sessionId);
			}
			picker.hide();
		}));
		disposables.add(picker.onDidHide(() => disposables.dispose()));
		picker.show();
	}

	private _buildItems(sorted: readonly IDroxSessionListEntry[]): (IDroxSessionPickItem | IQuickPickSeparator)[] {
		const items: (IDroxSessionPickItem | IQuickPickSeparator)[] = [];
		for (const group of groupDroxSessionsByDate(sorted)) {
			items.push({ type: 'separator', label: group.label });
			for (const entry of group.entries) {
				items.push(toPickItem(entry));
			}
		}
		return items;
	}
}
