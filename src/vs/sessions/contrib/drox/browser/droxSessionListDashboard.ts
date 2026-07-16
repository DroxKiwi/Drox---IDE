/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as DOM from '../../../../base/browser/dom.js';
import { getBaseLayerHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegate2.js';
import { getDefaultHoverDelegate } from '../../../../base/browser/ui/hover/hoverDelegateFactory.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { DROX_SESSIONS_PROVIDER_ID } from '../../../../workbench/contrib/drox/common/droxAgentsSession.js';
import { ISession } from '../../../services/sessions/common/session.js';
import {
	IDroxSessionBackgroundService,
	IDroxSessionDashboardSignals,
} from '../common/droxSessionBackgroundService.js';
import {
	formatResourcePercent,
	paintResourceSparkline,
} from '../common/droxSessionResourceMetrics.js';

const $ = DOM.$;

/** Extra list row height when the Drox dashboard strip is visible. */
export const DROX_DASHBOARD_ROW_HEIGHT = 20;
/**
 * Persistent cards: status lamps on one line + 5 metric chips on the next.
 * Keep in sync with `.drox-session-dashboard-row` min-height in CSS.
 */
export const DROX_DASHBOARD_ROW_HEIGHT_EXPANDED = 58;

const METRIC_ORANGE = '#e89b2a';
const METRIC_HOT = '#e85d2a';

export interface IDroxSessionItemDashboardHost {
	readonly dashboardRow: HTMLElement;
}

export function createDroxSessionItemDashboardRow(mainCol: HTMLElement): IDroxSessionItemDashboardHost {
	const dashboardRow = DOM.append(mainCol, $('.drox-session-dashboard-row'));
	dashboardRow.style.display = 'none';
	return { dashboardRow };
}

export function getDroxSessionDashboardRowHeight(
	session: ISession,
	backgroundService: IDroxSessionBackgroundService | undefined,
): number {
	if (!backgroundService || session.providerId !== DROX_SESSIONS_PROVIDER_ID) {
		return 0;
	}
	if (!shouldShowDroxDashboardRow(session, backgroundService.getDashboardSignals(session.sessionId).get())) {
		return 0;
	}
	const signals = backgroundService.getDashboardSignals(session.sessionId).get();
	return signals.backgroundPersistent ? DROX_DASHBOARD_ROW_HEIGHT_EXPANDED : DROX_DASHBOARD_ROW_HEIGHT;
}

export function renderDroxSessionItemDashboard(
	element: ISession,
	host: IDroxSessionItemDashboardHost,
	backgroundService: IDroxSessionBackgroundService | undefined,
	elementDisposables: DisposableStore,
	onHeightChange?: () => void,
): void {
	if (!backgroundService || element.providerId !== DROX_SESSIONS_PROVIDER_ID) {
		host.dashboardRow.style.display = 'none';
		return;
	}

	DOM.clearNode(host.dashboardRow);

	const statusRow = DOM.append(host.dashboardRow, $('.drox-session-dashboard-status'));
	const persistBadge = DOM.append(statusRow, $('span.drox-dashboard-persist-badge', {
		title: localize('drox.dashboard.persistBadge', "Background persistence enabled"),
	}));
	DOM.append(persistBadge, $(ThemeIcon.asCSSSelector(Codicon.debugStop)));

	const lamps = DOM.append(statusRow, $('.drox-session-dashboard-lamps'));
	const shellLamp = createLamp(lamps, Codicon.terminal, localize('drox.dashboard.shell', "Shell running"));
	const modelLamp = createLamp(lamps, Codicon.sparkle, localize('drox.dashboard.model', "Agent responding"));
	const gitLamp = createLamp(lamps, Codicon.cloudUpload, localize('drox.dashboard.git', "Git operation"));
	const inputLamp = createLamp(lamps, Codicon.question, localize('drox.dashboard.input', "Needs input"));

	const metrics = DOM.append(host.dashboardRow, $('.drox-session-dashboard-metrics'));
	const cpuMetric = createMetricChip(metrics, Codicon.pulse, localize('drox.dashboard.cpu', "CPU"));
	const ramMetric = createMetricChip(metrics, Codicon.serverProcess, localize('drox.dashboard.ram', "RAM"));
	const diskMetric = createMetricChip(metrics, Codicon.database, localize('drox.dashboard.disk', "Disk"));
	const downMetric = createMetricChip(metrics, Codicon.cloudDownload, localize('drox.dashboard.download', "Download"));
	const upMetric = createMetricChip(metrics, Codicon.arrowUp, localize('drox.dashboard.upload', "Upload"));

	elementDisposables.add(getBaseLayerHoverDelegate().setupManagedHover(
		getDefaultHoverDelegate('element'),
		cpuMetric.root,
		() => ({
			element: () => buildMetricHover(
				localize('drox.dashboard.cpuHoverTitle', "CPU · last hour"),
				backgroundService.getResourceMetrics(element.sessionId).get().cpuHistory,
				localize('drox.dashboard.cpuHoverHint', "Share of system load attributed to this session"),
			),
		}),
	));
	elementDisposables.add(getBaseLayerHoverDelegate().setupManagedHover(
		getDefaultHoverDelegate('element'),
		ramMetric.root,
		() => ({
			element: () => buildMetricHover(
				localize('drox.dashboard.ramHoverTitle', "RAM · last hour"),
				backgroundService.getResourceMetrics(element.sessionId).get().ramHistory,
				localize('drox.dashboard.ramHoverHint', "Share of system memory attributed to this session"),
			),
		}),
	));
	elementDisposables.add(getBaseLayerHoverDelegate().setupManagedHover(
		getDefaultHoverDelegate('element'),
		diskMetric.root,
		() => ({
			element: () => buildMetricHover(
				localize('drox.dashboard.diskHoverTitle', "Disk · last hour"),
				backgroundService.getResourceMetrics(element.sessionId).get().diskHistory,
				localize('drox.dashboard.diskHoverHint', "Estimated session cache / changes (soft 512 MB scale)"),
			),
		}),
	));
	elementDisposables.add(getBaseLayerHoverDelegate().setupManagedHover(
		getDefaultHoverDelegate('element'),
		downMetric.root,
		() => ({
			element: () => buildMetricHover(
				localize('drox.dashboard.downloadHoverTitle', "Download · last hour"),
				backgroundService.getResourceMetrics(element.sessionId).get().downloadHistory,
				localize('drox.dashboard.downloadHoverHint', "Estimated inbound traffic (model / git / shell)"),
			),
		}),
	));
	elementDisposables.add(getBaseLayerHoverDelegate().setupManagedHover(
		getDefaultHoverDelegate('element'),
		upMetric.root,
		() => ({
			element: () => buildMetricHover(
				localize('drox.dashboard.uploadHoverTitle', "Upload · last hour"),
				backgroundService.getResourceMetrics(element.sessionId).get().uploadHistory,
				localize('drox.dashboard.uploadHoverHint', "Estimated outbound traffic (model / git / shell)"),
			),
		}),
	));

	let lastRowVisible = false;
	let lastExpanded = false;

	elementDisposables.add(autorun(reader => {
		const signals = backgroundService.getDashboardSignals(element.sessionId).read(reader);
		const resource = backgroundService.getResourceMetrics(element.sessionId).read(reader);
		const rowVisible = shouldShowDroxDashboardRow(element, signals);
		const expanded = signals.backgroundPersistent;

		host.dashboardRow.style.display = rowVisible ? '' : 'none';
		host.dashboardRow.classList.toggle('drox-dashboard-expanded', expanded);
		persistBadge.style.display = expanded ? '' : 'none';
		metrics.style.display = expanded ? '' : 'none';

		setLamp(shellLamp, signals.shellActive, expanded);
		setLamp(modelLamp, signals.modelActive, expanded);
		setLamp(gitLamp, signals.gitOperationActive, expanded);
		setLamp(inputLamp, signals.needsInput, expanded);

		if (expanded) {
			updateMetricChip(cpuMetric, resource.cpuPercent);
			updateMetricChip(ramMetric, resource.ramPercent);
			updateMetricChip(diskMetric, resource.diskPercent);
			updateMetricChip(downMetric, resource.downloadPercent);
			updateMetricChip(upMetric, resource.uploadPercent);
		}

		if (lastRowVisible !== rowVisible || lastExpanded !== expanded) {
			lastRowVisible = rowVisible;
			lastExpanded = expanded;
			onHeightChange?.();
		}
	}));
}

/** Dashboard strip is only for background-persistent (tracked) sessions. */
function shouldShowDroxDashboardRow(_session: ISession, signals: IDroxSessionDashboardSignals): boolean {
	return signals.backgroundPersistent;
}

function createLamp(container: HTMLElement, icon: ThemeIcon, title: string): HTMLElement {
	const lamp = DOM.append(container, $('span.drox-dashboard-lamp', { title }));
	DOM.append(lamp, $(ThemeIcon.asCSSSelector(icon)));
	return lamp;
}

interface IMetricChip {
	readonly root: HTMLElement;
	readonly value: HTMLElement;
}

function createMetricChip(container: HTMLElement, icon: ThemeIcon, label: string): IMetricChip {
	const root = DOM.append(container, $('span.drox-dashboard-metric', {
		'aria-label': label,
	}));
	DOM.append(root, $(ThemeIcon.asCSSSelector(icon)));
	const value = DOM.append(root, $('span.drox-dashboard-metric-value'));
	value.textContent = '—';
	return { root, value };
}

function updateMetricChip(chip: IMetricChip, percent: number): void {
	chip.value.textContent = formatResourcePercent(percent);
	chip.root.classList.toggle('hot', percent >= 70);
	chip.root.classList.toggle('warm', percent >= 40 && percent < 70);
}

function buildMetricHover(title: string, history: readonly number[], hint: string): HTMLElement {
	const root = $('.drox-metric-hover');
	const heading = DOM.append(root, $('.drox-metric-hover-title'));
	heading.textContent = title;

	const canvas = DOM.append(root, $('canvas.drox-metric-hover-canvas')) as HTMLCanvasElement;
	paintResourceSparkline(canvas, history, METRIC_ORANGE);

	const footer = DOM.append(root, $('.drox-metric-hover-footer'));
	const latest = history.length > 0 ? history[history.length - 1]! : 0;
	footer.textContent = `${formatResourcePercent(latest)} · ${hint}`;

	if (latest >= 70) {
		footer.style.color = METRIC_HOT;
	}

	return root;
}

/** When expanded (persistent), inactive slots stay visible but dimmed. */
function setLamp(lamp: HTMLElement, active: boolean, showAllSlots: boolean): void {
	lamp.classList.toggle('on', active);
	lamp.classList.toggle('idle', showAllSlots && !active);
	if (showAllSlots) {
		lamp.style.display = '';
		return;
	}
	lamp.style.display = active ? '' : 'none';
}
