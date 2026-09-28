/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { IQuickInputButton, IQuickInputService, IQuickPickItem, IQuickPickSeparator } from '../../../../../platform/quickinput/common/quickInput.js';
import { sessionDateFromNow } from '../../../chat/browser/agentSessions/agentSessionsViewer.js';
import { formatDroxSessionListLabel } from '../../common/droxNativeChatSessionResolver.js';
import { IDroxSessionListEntry } from '../../common/droxSession.js';
import {
	IDroxIdeSessionHistoryGroup,
} from '../../common/droxIdeSessionHistoryGroups.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

interface IDroxSessionPickItem extends IQuickPickItem {
	readonly sessionId: string;
}

interface IDroxSessionDateGroup {
	readonly label: string;
	readonly entries: readonly IDroxSessionListEntry[];
}

const deleteButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.trash),
	tooltip: localize('drox.agentSessions.delete', 'Delete'),
};

const deleteSelectedButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.trash),
	tooltip: localize('drox.agentSessions.deleteSelected', 'Delete selected'),
};

const groupSelectedButton: IQuickInputButton = {
	iconClass: ThemeIcon.asClassName(Codicon.folder),
	tooltip: localize('drox.agentSessions.groupSelected', 'Group selected'),
};

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
		buttons: [deleteButton],
	};
}

export type DroxAgentSessionsPickHandler = (sessionId: string) => void | Promise<void>;
export type DroxAgentSessionsDeleteHandler = (sessionIds: readonly string[]) => void | Promise<void>;
export type DroxAgentSessionsGroupHandler = (sessionIds: readonly string[]) => void | Promise<void>;

export interface IDroxAgentSessionsPickerOptions {
	readonly historyGroups?: readonly IDroxIdeSessionHistoryGroup[];
	readonly onDelete?: DroxAgentSessionsDeleteHandler;
	readonly onGroup?: DroxAgentSessionsGroupHandler;
}

/** Sélecteur de sessions Drox (groupement + delete / multi-delete / groupes). */
export class DroxAgentSessionsPicker {

	constructor(
		@IQuickInputService private readonly quickInputService: IQuickInputService,
	) { }

	async pickSession(
		entries: readonly IDroxSessionListEntry[],
		onPick: DroxAgentSessionsPickHandler,
		options?: IDroxAgentSessionsPickerOptions,
	): Promise<void> {
		if (entries.length === 0) {
			return;
		}

		let currentEntries = [...entries];
		let currentGroups = [...(options?.historyGroups ?? [])];
		const disposables = new DisposableStore();
		const picker = disposables.add(this.quickInputService.createQuickPick<IDroxSessionPickItem>({ useSeparators: true }));
		picker.placeholder = localize('drox.agentSessions.pickPlaceholder', 'Search Drox chat sessions');
		picker.matchOnDescription = true;
		picker.canSelectMany = true;
		picker.ok = true;
		picker.title = localize('drox.agentSessions.historyTitle', 'Session History');
		const titleButtons: IQuickInputButton[] = [];
		if (options?.onDelete) {
			titleButtons.push(deleteSelectedButton);
		}
		if (options?.onGroup) {
			titleButtons.push(groupSelectedButton);
		}
		picker.buttons = titleButtons;
		picker.items = this._buildItems(currentEntries, currentGroups);

		disposables.add(picker.onDidAccept(async () => {
			const selected = picker.selectedItems;
			if (selected.length === 0) {
				return;
			}
			if (selected.length === 1) {
				await onPick(selected[0]!.sessionId);
				picker.hide();
				return;
			}
			const byId = new Map(currentEntries.map(e => [e.id, e] as const));
			const sorted = [...selected].sort((a, b) => {
				const ea = byId.get(a.sessionId);
				const eb = byId.get(b.sessionId);
				return (eb?.modifiedSecs ?? 0) - (ea?.modifiedSecs ?? 0);
			});
			await onPick(sorted[0]!.sessionId);
			picker.hide();
		}));

		disposables.add(picker.onDidTriggerItemButton(async e => {
			if (e.button !== deleteButton || !options?.onDelete) {
				return;
			}
			const keepValue = picker.value;
			await options.onDelete([e.item.sessionId]);
			currentEntries = currentEntries.filter(entry => entry.id !== e.item.sessionId);
			currentGroups = currentGroups
				.map(g => ({ ...g, sessionIds: g.sessionIds.filter(id => id !== e.item.sessionId) }))
				.filter(g => g.sessionIds.length > 0);
			if (currentEntries.length === 0) {
				picker.hide();
				return;
			}
			picker.items = this._buildItems(currentEntries, currentGroups);
			picker.value = keepValue;
		}));

		disposables.add(picker.onDidTriggerButton(async button => {
			const selectedIds = picker.selectedItems.map(i => i.sessionId);
			if (button === deleteSelectedButton && options?.onDelete) {
				if (selectedIds.length === 0) {
					return;
				}
				await options.onDelete(selectedIds);
				const remove = new Set(selectedIds);
				currentEntries = currentEntries.filter(entry => !remove.has(entry.id));
				currentGroups = currentGroups
					.map(g => ({ ...g, sessionIds: g.sessionIds.filter(id => !remove.has(id)) }))
					.filter(g => g.sessionIds.length > 0);
				if (currentEntries.length === 0) {
					picker.hide();
					return;
				}
				picker.items = this._buildItems(currentEntries, currentGroups);
				picker.selectedItems = [];
				return;
			}
			if (button === groupSelectedButton && options?.onGroup) {
				if (selectedIds.length === 0) {
					return;
				}
				await options.onGroup(selectedIds);
				picker.hide();
			}
		}));

		disposables.add(picker.onDidHide(() => disposables.dispose()));
		picker.show();
	}

	private _buildItems(
		sorted: readonly IDroxSessionListEntry[],
		historyGroups: readonly IDroxIdeSessionHistoryGroup[],
	): (IDroxSessionPickItem | IQuickPickSeparator)[] {
		const items: (IDroxSessionPickItem | IQuickPickSeparator)[] = [];
		const groupedIds = new Set<string>();

		for (const group of historyGroups) {
			const members = sorted.filter(e => group.sessionIds.includes(e.id));
			if (members.length === 0) {
				continue;
			}
			items.push({ type: 'separator', label: group.name });
			for (const entry of members) {
				groupedIds.add(entry.id);
				items.push(toPickItem(entry));
			}
		}

		const ungrouped = sorted.filter(e => !groupedIds.has(e.id));
		for (const group of groupDroxSessionsByDate(ungrouped)) {
			items.push({ type: 'separator', label: group.label });
			for (const entry of group.entries) {
				items.push(toPickItem(entry));
			}
		}
		return items;
	}
}
