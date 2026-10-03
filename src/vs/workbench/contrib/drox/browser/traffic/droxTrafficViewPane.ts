/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import * as dom from '../../../../../base/browser/dom.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { localize } from '../../../../../nls.js';
import { ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IViewDescriptorService } from '../../../../common/views.js';
import { droxTrafficKindLabel, IDroxTrafficService } from '../../common/traffic/droxTrafficService.js';
import { DROX_TRAFFIC_TAG_PALETTE } from '../../common/traffic/droxTrafficTags.js';
import {
	DROX_TRAFFIC_PAGE_SIZE,
	DroxTrafficMode,
	IDroxTrafficDestinationTag,
	IDroxTrafficEvent,
} from '../../common/traffic/droxTrafficTypes.js';
import './media/droxTraffic.css';

/**
 * Sidebar observatory for Drox in/out traffic (MITM v0).
 */
export class DroxTrafficViewPane extends ViewPane {

	private _body: HTMLElement | undefined;
	private _eventScroll: HTMLElement | undefined;
	private _selectedColor = DROX_TRAFFIC_TAG_PALETTE[0]!.color;
	/** 0 = most recent page. */
	private _ledgerPage = 0;

	constructor(
		options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IDroxTrafficService private readonly trafficService: IDroxTrafficService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this._register(this.trafficService.onDidChange(() => this._render()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('drox-traffic-host');
		this._body = dom.append(container, dom.$('.drox-traffic-root'));
		this._render();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this._body) {
			this._body.style.height = `${height}px`;
			this._body.style.width = `${width}px`;
		}
	}

	private _render(): void {
		if (!this._body) {
			return;
		}
		const prevEventScroll = this._eventScroll?.scrollTop ?? 0;
		dom.clearNode(this._body);

		const top = dom.append(this._body, dom.$('.drox-traffic-top'));

		const header = dom.append(top, dom.$('.drox-traffic-section'));
		dom.append(header, dom.$('h3', undefined, localize('drox.traffic.title', 'Traffic')));
		dom.append(header, dom.$('p.drox-traffic-muted', undefined, localize(
			'drox.traffic.blurb',
			'Man-in-the-middle view of Drox runtime requests (LLM, embed, MCP, tools). Not a system-wide proxy.',
		)));

		const controls = dom.append(top, dom.$('.drox-traffic-section'));
		dom.append(controls, dom.$('h4', undefined, localize('drox.traffic.capture', 'Capture')));

		const enableRow = dom.append(controls, dom.$('.drox-traffic-row'));
		const enableLabel = dom.append(enableRow, dom.$('label.drox-traffic-toggle')) as HTMLLabelElement;
		const enableToggle = dom.append(enableLabel, dom.$('input')) as HTMLInputElement;
		enableToggle.type = 'checkbox';
		enableToggle.checked = this.trafficService.enabled;
		enableToggle.onchange = () => void this.trafficService.setEnabled(enableToggle.checked).catch(err => {
			this.notificationService.error(String(err));
		});
		enableLabel.append(document.createTextNode(localize('drox.traffic.enabledToggle', 'Enable capture (remembered)')));

		const modeRow = dom.append(controls, dom.$('.drox-traffic-row'));
		const modeSelect = dom.append(modeRow, dom.$('select.drox-traffic-field.drox-traffic-field-sm')) as HTMLSelectElement;
		for (const [value, label] of [
			['live', localize('drox.traffic.modeLive', 'Live session (cleared on quit)')],
			['persisted', localize('drox.traffic.modePersisted', 'Persisted on disk')],
		] as const) {
			const opt = document.createElement('option');
			opt.value = value;
			opt.textContent = label;
			if (this.trafficService.mode === value) {
				opt.selected = true;
			}
			modeSelect.appendChild(opt);
		}
		modeSelect.onchange = () => void this.trafficService.setMode(modeSelect.value as DroxTrafficMode).catch(err => {
			this.notificationService.error(String(err));
		});

		const clearBtn = dom.append(modeRow, dom.$('button.drox-traffic-btn')) as HTMLButtonElement;
		clearBtn.textContent = localize('drox.traffic.clear', 'Clear');
		clearBtn.onclick = () => void this.trafficService.clear().then(
			() => {
				this._ledgerPage = 0;
				this.notificationService.info(localize('drox.traffic.cleared', 'Traffic buffer cleared.'));
			},
			err => this.notificationService.error(String(err)),
		);

		dom.append(controls, dom.$('p.drox-traffic-path', undefined, this.trafficService.getPersistDirFsPath()));

		this._renderTagsSection(top);
		this._renderAlertsSection(top);
		this._renderHistory(this._body);

		if (this._eventScroll) {
			this._eventScroll.scrollTop = prevEventScroll;
		}
	}

	private _renderHistory(parent: HTMLElement): void {
		const history = dom.append(parent, dom.$('.drox-traffic-history'));
		const head = dom.append(history, dom.$('.drox-traffic-history-head'));
		dom.append(head, dom.$('h4', undefined, localize('drox.traffic.events', 'Ledger')));

		const all = this.trafficService.events;
		const total = all.length;
		const pageCount = Math.max(1, Math.ceil(total / DROX_TRAFFIC_PAGE_SIZE) || 1);
		if (this._ledgerPage >= pageCount) {
			this._ledgerPage = Math.max(0, pageCount - 1);
		}
		const page = this._ledgerPage;
		const start = page * DROX_TRAFFIC_PAGE_SIZE;
		const end = Math.min(start + DROX_TRAFFIC_PAGE_SIZE, total);
		const pageEvents = all.slice(start, end);

		dom.append(head, dom.$('span.drox-traffic-muted', undefined, total
			? localize(
				'drox.traffic.ledgerCount',
				'{0}–{1} / {2}',
				String(total ? start + 1 : 0),
				String(end),
				String(total),
			)
			: '0'));

		const scroll = dom.append(history, dom.$('.drox-traffic-event-scroll'));
		this._eventScroll = scroll;

		if (!this.trafficService.enabled) {
			dom.append(scroll, dom.$('p.drox-traffic-empty', undefined, localize(
				'drox.traffic.disabledHint',
				'Capture is off — enable above to start recording.',
			)));
			return;
		}
		if (!total) {
			dom.append(scroll, dom.$('p.drox-traffic-empty', undefined, localize(
				'drox.traffic.empty',
				'No events yet. Run an agent turn or reindex to see traffic.',
			)));
			return;
		}

		const list = dom.append(scroll, dom.$('ul.drox-traffic-event-list'));
		for (const ev of pageEvents) {
			appendEventRow(list, ev);
		}

		if (pageCount > 1 || total > DROX_TRAFFIC_PAGE_SIZE) {
			this._renderPager(history, page, pageCount, total);
		}
	}

	private _renderPager(parent: HTMLElement, page: number, pageCount: number, total: number): void {
		const pager = dom.append(parent, dom.$('.drox-traffic-pager'));
		const prev = dom.append(pager, dom.$('button.drox-traffic-btn.drox-traffic-btn-ghost')) as HTMLButtonElement;
		prev.textContent = localize('drox.traffic.pagePrev', 'Newer');
		prev.disabled = page <= 0;
		prev.onclick = () => {
			this._ledgerPage = Math.max(0, this._ledgerPage - 1);
			this._render();
		};

		dom.append(pager, dom.$('span.drox-traffic-pager-label', undefined, localize(
			'drox.traffic.pageLabel',
			'Page {0}/{1} · {2}/page',
			String(page + 1),
			String(pageCount),
			String(DROX_TRAFFIC_PAGE_SIZE),
		)));

		const next = dom.append(pager, dom.$('button.drox-traffic-btn.drox-traffic-btn-ghost')) as HTMLButtonElement;
		next.textContent = localize('drox.traffic.pageNext', 'Older');
		next.disabled = page >= pageCount - 1 || total === 0;
		next.onclick = () => {
			this._ledgerPage = Math.min(pageCount - 1, this._ledgerPage + 1);
			this._render();
		};
	}

	private _renderAlertsSection(parent: HTMLElement): void {
		const section = dom.append(parent, dom.$('.drox-traffic-section'));
		dom.append(section, dom.$('h4', undefined, localize('drox.traffic.alerts', 'Destination alerts')));
		dom.append(section, dom.$('p.drox-traffic-muted', undefined, localize(
			'drox.traffic.alertsHint',
			'Toast when traffic hits a host / IP / URL fragment (partial match). Cooldown ~15s per rule.',
		)));

		const form = dom.append(section, dom.$('.drox-traffic-tag-form'));
		const matchInput = dom.append(form, dom.$('input.drox-traffic-field')) as HTMLInputElement;
		matchInput.type = 'text';
		matchInput.placeholder = localize('drox.traffic.alertMatchPh', 'Host / IP / URL (e.g. ollama.com)');
		const labelInput = dom.append(form, dom.$('input.drox-traffic-field')) as HTMLInputElement;
		labelInput.type = 'text';
		labelInput.placeholder = localize('drox.traffic.alertLabelPh', 'Optional label (e.g. Cloud API)');

		const addBtn = dom.append(form, dom.$('button.drox-traffic-btn.drox-traffic-btn-primary')) as HTMLButtonElement;
		addBtn.textContent = localize('drox.traffic.alertAdd', 'Add alert');
		const submit = () => void this.trafficService.addDestinationAlert({
			match: matchInput.value,
			label: labelInput.value,
		}).catch(err => this.notificationService.error(String(err)));
		addBtn.onclick = () => submit();
		matchInput.onkeydown = e => {
			if (e.key === 'Enter') {
				e.preventDefault();
				submit();
			}
		};
		labelInput.onkeydown = e => {
			if (e.key === 'Enter') {
				e.preventDefault();
				submit();
			}
		};

		const alerts = this.trafficService.destinationAlerts;
		if (!alerts.length) {
			dom.append(section, dom.$('p.drox-traffic-muted', undefined, localize(
				'drox.traffic.alertsEmpty',
				'No alerts yet — add one above.',
			)));
			return;
		}
		const list = dom.append(section, dom.$('ul.drox-traffic-tag-list'));
		for (const alert of alerts) {
			const row = dom.append(list, dom.$('li.drox-traffic-tag-row'));
			const pill = dom.append(row, dom.$('span.drox-traffic-alert-pill')) as HTMLElement;
			pill.textContent = alert.label?.trim() || localize('drox.traffic.alertDefault', 'Alert');
			dom.append(row, dom.$('span.drox-traffic-tag-match', undefined, alert.match));
			const del = dom.append(row, dom.$('button.drox-traffic-btn.drox-traffic-btn-ghost')) as HTMLButtonElement;
			del.type = 'button';
			del.textContent = localize('drox.traffic.alertRemove', 'Remove');
			del.onclick = () => void this.trafficService.removeDestinationAlert(alert.id).catch(err => {
				this.notificationService.error(String(err));
			});
		}
	}

	private _renderTagsSection(parent: HTMLElement): void {
		const section = dom.append(parent, dom.$('.drox-traffic-section'));
		dom.append(section, dom.$('h4', undefined, localize('drox.traffic.tags', 'Destination tags')));
		dom.append(section, dom.$('p.drox-traffic-muted', undefined, localize(
			'drox.traffic.tagsHint',
			'Partial match on host / IP / URL (e.g. ollama.com → www.ollama.com/…). Applies to the whole ledger.',
		)));

		const form = dom.append(section, dom.$('.drox-traffic-tag-form'));
		const labelInput = dom.append(form, dom.$('input.drox-traffic-field')) as HTMLInputElement;
		labelInput.type = 'text';
		labelInput.placeholder = localize('drox.traffic.tagLabelPh', 'Label (e.g. Local LLM)');
		const matchInput = dom.append(form, dom.$('input.drox-traffic-field')) as HTMLInputElement;
		matchInput.type = 'text';
		matchInput.placeholder = localize('drox.traffic.tagMatchPh', 'Host / IP / URL fragment (e.g. ollama.com)');

		const colorRow = dom.append(form, dom.$('.drox-traffic-color-swatches'));
		const preview = dom.append(colorRow, dom.$('span.drox-traffic-tag-pill')) as HTMLElement;
		const swatchButtons: HTMLButtonElement[] = [];
		const syncPreview = () => {
			preview.textContent = labelInput.value.trim() || localize('drox.traffic.tagPreview', 'Tag');
			preview.style.backgroundColor = this._selectedColor;
			for (const btn of swatchButtons) {
				btn.classList.toggle('is-active', btn.dataset.color === this._selectedColor);
			}
		};
		for (const swatch of DROX_TRAFFIC_TAG_PALETTE) {
			const btn = dom.append(colorRow, dom.$('button.drox-traffic-swatch')) as HTMLButtonElement;
			btn.type = 'button';
			btn.style.backgroundColor = swatch.color;
			btn.dataset.color = swatch.color;
			btn.title = swatch.label;
			btn.onclick = () => {
				this._selectedColor = swatch.color;
				syncPreview();
			};
			swatchButtons.push(btn);
		}
		labelInput.oninput = syncPreview;
		syncPreview();

		const addBtn = dom.append(form, dom.$('button.drox-traffic-btn.drox-traffic-btn-primary')) as HTMLButtonElement;
		addBtn.type = 'button';
		addBtn.textContent = localize('drox.traffic.tagAdd', 'Add tag');
		const submit = () => void this.trafficService.addDestinationTag({
			label: labelInput.value,
			color: this._selectedColor,
			match: matchInput.value,
		}).catch(err => this.notificationService.error(String(err)));
		addBtn.onclick = () => submit();
		labelInput.onkeydown = e => {
			if (e.key === 'Enter') {
				e.preventDefault();
				submit();
			}
		};
		matchInput.onkeydown = e => {
			if (e.key === 'Enter') {
				e.preventDefault();
				submit();
			}
		};

		const tags = this.trafficService.destinationTags;
		if (!tags.length) {
			dom.append(section, dom.$('p.drox-traffic-muted', undefined, localize(
				'drox.traffic.tagsEmpty',
				'No tags yet — add one above. Existing ledger rows update immediately.',
			)));
			return;
		}
		const list = dom.append(section, dom.$('ul.drox-traffic-tag-list'));
		for (const tag of tags) {
			const row = dom.append(list, dom.$('li.drox-traffic-tag-row'));
			appendTagPill(row, tag);
			dom.append(row, dom.$('span.drox-traffic-tag-match', undefined, tag.match));
			const del = dom.append(row, dom.$('button.drox-traffic-btn.drox-traffic-btn-ghost')) as HTMLButtonElement;
			del.type = 'button';
			del.textContent = localize('drox.traffic.tagRemove', 'Remove');
			del.onclick = () => void this.trafficService.removeDestinationTag(tag.id).catch(err => {
				this.notificationService.error(String(err));
			});
		}
	}
}

function appendEventRow(list: HTMLElement, ev: IDroxTrafficEvent): void {
	const dir = ev.direction === 'out' ? '→' : '←';
	const line = dom.append(list, dom.$('li.drox-traffic-event'));
	dom.append(line, dom.$('span.drox-traffic-time', undefined, formatTrafficTimestamp(ev.at)));
	if (ev.tag) {
		appendTagPill(line, ev.tag);
	} else {
		dom.append(line, dom.$('span'));
	}
	const summary = truncateOneLine(ev.summary, 96);
	const summaryEl = dom.append(line, dom.$('span.drox-traffic-summary', undefined, `${dir} ${summary}`));
	const tipParts = [
		ev.summary,
		ev.destination ? `dest: ${ev.destination}` : undefined,
		ev.detail,
		ev.status ? `status: ${ev.status}` : undefined,
	].filter(Boolean);
	summaryEl.title = tipParts.join('\n');
	const meta = [
		droxTrafficKindLabel(ev.kind),
		typeof ev.durationMs === 'number' ? `${ev.durationMs}ms` : undefined,
	].filter(Boolean).join(' · ');
	dom.append(line, dom.$('span.drox-traffic-meta', undefined, meta));
}

function appendTagPill(parent: HTMLElement, tag: IDroxTrafficDestinationTag): void {
	const pill = dom.append(parent, dom.$('span.drox-traffic-tag-pill')) as HTMLElement;
	pill.textContent = tag.label;
	pill.style.backgroundColor = tag.color;
	pill.title = localize('drox.traffic.tagTitle', 'Match: {0}', tag.match);
}

function formatTrafficTimestamp(at: number): string {
	const d = new Date(at);
	if (Number.isNaN(d.getTime())) {
		return '--:--:--';
	}
	const pad = (n: number, w = 2) => String(n).padStart(w, '0');
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function truncateOneLine(text: string, max: number): string {
	const one = text.replace(/\s+/g, ' ').trim();
	return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}
