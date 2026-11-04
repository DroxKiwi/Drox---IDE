/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DROX_TUTORIAL_STEPS, DROX_TUTORIAL_VSCODE_DOCS, DroxTutorialStep } from './droxTutorialSteps.js';

const PLAY = '.session-title-toolbar .action-label.codicon-debug-continue, .session-title-toolbar .action-label.codicon-debug-stop';

/** One IDE step, in this window. A string replaces the spotlight. A patch can also drop `open`. */
function shared(id: string, targetOrPatch?: string | Partial<DroxTutorialStep>): DroxTutorialStep {
	const step = DROX_TUTORIAL_STEPS.find(item => item.id === id);
	if (!step) {
		throw new Error(`Missing tutorial step ${id}`);
	}
	if (typeof targetOrPatch === 'string') {
		return { ...step, target: targetOrPatch };
	}
	return targetOrPatch ? { ...step, ...targetOrPatch } : step;
}

/** The history-card icon, shown before the panel itself. Same words as the IDE activity-bar step. */
function historyIcon(id: string, codicon: string): DroxTutorialStep {
	return shared(id, {
		target: `.session-title-toolbar .action-label.codicon-${codicon}`,
		fallback: '.session-title-toolbar',
		open: undefined,
		revealSessionTools: true,
		ensureHistory: true,
	});
}

/**
 * Agents tour, in display order. Read top to bottom.
 * Someone may open this window first: the chat and each panel are the full IDE
 * cards, only the spotlight moves to the control in this window.
 * A card written out here belongs only to Agents.
 */
export const DROX_AGENTS_TUTORIAL_STEPS: readonly DroxTutorialStep[] = [
	{
		id: 'agents-window',
		title: 'Tutorial',
		body: 'Drox IDE is a fork of Visual Studio Code. Most features of version 1.127 are included.',
		link: { label: 'Visual Studio Code documentation', href: DROX_TUTORIAL_VSCODE_DOCS },
	},
	{
		id: 'agents-open-in-editor',
		title: 'Open in Editor',
		body: 'Open in Editor opens this same workspace in the IDE window. That window is the editor, laid out around the files. This tour stays here and does not open it. The chat and each panel are presented in the steps that follow.',
		target: '.open-in-vscode-titlebar-widget',
	},

	shared('model-picker', '.agent-sessions-workbench .model-picker-split'),
	shared('model'),
	shared('server'),
	shared('auto'),
	shared('align-chip'),
	shared('permission'),
	shared('model-window'),
	shared('server-window'),
	shared('change-connection'),
	shared('wizard'),
	shared('wizard-sample'),

	historyIcon('codebase-button', 'database'),
	shared('codebase-index'),
	shared('codebase-pipeline'),
	shared('codebase-embed'),
	shared('codebase-inject'),
	shared('codebase-state'),
	shared('codebase-actions'),
	shared('codebase-catalog'),
	shared('codebase-probe'),
	historyIcon('regulation-button', 'graph-line'),
	shared('regulation-scores'),
	shared('regulation-levers'),
	shared('regulation-charts'),
	shared('regulation-history'),
	historyIcon('traffic-button', 'radio-tower'),
	shared('traffic-capture'),
	shared('traffic-ledger'),
	shared('traffic-alerts'),
	historyIcon('ports-button', 'plug'),
	shared('ports-tools'),
	shared('ports-forwards'),
	historyIcon('sdtcm-button', 'map'),
	shared('sdtcm-map'),
	shared('sdtcm-header'),
	shared('sdtcm-open'),
	shared('sdtcm-tools'),
	shared('sdtcm-tags'),
	shared('sdtcm-links'),
	shared('sdtcm-focus'),
	shared('sdtcm-align'),

	{
		id: 'agents-history',
		title: 'History',
		body: 'This list is the history of discussions. Each card is one session. Select a card to bring that conversation, its folder, and its layout back. Switching cards is how you move between discussions.',
		target: '.agent-sessions-viewpane',
	},
	{
		id: 'agents-card-tools',
		title: 'History',
		body: 'The icons on a card belong to that discussion. They open its notes, and Codebase, Regulation, Traffic, Ports, and SDTCM for its folder — the panels the previous steps just opened. The eye and the lock allow reading or writing outside that folder.',
		target: '.session-title-toolbar',
		revealSessionTools: true,
	},
	{
		id: 'agents-play',
		title: 'Keep running',
		body: 'This control keeps the session running in the background. Off, it is a triangle: leaving this discussion stops its shells and the answer in progress. On, it is a square: the session stays active while you open another one. This tour does not press it.',
		target: PLAY,
		revealSessionTools: true,
	},
	{
		id: 'agents-lamps',
		title: 'Session status',
		body: 'With the session kept running, a row appears on the card. The lamps are Shell, the agent responding, a git operation, and Needs input. A lit lamp is work happening now. A dim lamp is a quiet slot.',
		target: '.drox-session-dashboard-lamps',
		fallback: PLAY,
		revealSessionTools: true,
	},
	{
		id: 'agents-stats',
		title: 'Session statistics',
		body: 'The same row is the session\'s share of this machine over the last hour: CPU, memory, disk, download, and upload. Hover a figure to see the curve. The numbers are shown only while the session is kept running.',
		target: '.drox-session-dashboard-metrics',
		fallback: PLAY,
		revealSessionTools: true,
	},
];
