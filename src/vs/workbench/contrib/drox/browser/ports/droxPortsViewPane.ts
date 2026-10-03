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
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IDroxPortsService } from '../../common/ports/droxPortsService.js';
import { IDroxPortsForward, IDroxPortsTool } from '../../common/ports/droxPortsTypes.js';
import './media/droxPorts.css';

/**
 * Declarative port forwards + external tool profiles (ssh / socat / …).
 */
export class DroxPortsViewPane extends ViewPane {

	private _body: HTMLElement | undefined;

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
		@IDroxPortsService private readonly portsService: IDroxPortsService,
		@INotificationService private readonly notificationService: INotificationService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
		this._register(this.portsService.onDidChange(() => this._render()));
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('drox-ports-host');
		this._body = dom.append(container, dom.$('.drox-ports-root'));
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
		dom.clearNode(this._body);

		const header = dom.append(this._body, dom.$('.drox-ports-section'));
		dom.append(header, dom.$('h3', undefined, localize('drox.ports.title', 'Ports')));
		dom.append(header, dom.$('p.drox-ports-muted', undefined, localize(
			'drox.ports.blurb',
			'Declare forwards and an external tool (ssh, socat, script…). Local preview stays native; this layer tunnels to any host.',
		)));
		const openSettings = dom.append(header, dom.$('button.drox-ports-btn.drox-ports-btn-ghost')) as HTMLButtonElement;
		openSettings.type = 'button';
		openSettings.textContent = localize('drox.ports.openSettings', 'Open drox.ports settings');
		openSettings.onclick = () => void this.preferencesService.openSettings({ jsonEditor: false, query: 'drox.ports' });

		this._renderToolsSection(this._body);
		this._renderForwardsSection(this._body);
	}

	private _renderToolsSection(parent: HTMLElement): void {
		const section = dom.append(parent, dom.$('.drox-ports-section'));
		dom.append(section, dom.$('h4', undefined, localize('drox.ports.tools', 'External tools')));
		dom.append(section, dom.$('p.drox-ports-muted', undefined, localize(
			'drox.ports.toolsHint',
			'User-scoped. Placeholders: {{localHost}} {{localPort}} {{remoteHost}} {{remotePort}}.',
		)));

		const form = dom.append(section, dom.$('.drox-ports-form'));
		const labelInput = dom.append(form, dom.$('input.drox-ports-field')) as HTMLInputElement;
		labelInput.placeholder = localize('drox.ports.toolLabelPh', 'Label (e.g. SSH bastion)');
		const commandInput = dom.append(form, dom.$('input.drox-ports-field')) as HTMLInputElement;
		commandInput.placeholder = localize('drox.ports.toolCommandPh', 'Command (e.g. ssh)');
		commandInput.value = 'ssh';
		const argsInput = dom.append(form, dom.$('input.drox-ports-field')) as HTMLInputElement;
		argsInput.placeholder = localize(
			'drox.ports.toolArgsPh',
			'Args space-separated (e.g. -N -L {{localHost}}:{{localPort}}:{{remoteHost}}:{{remotePort}} user@host)',
		);
		argsInput.value = '-N -L {{localHost}}:{{localPort}}:{{remoteHost}}:{{remotePort}} user@bastion.example';

		const addBtn = dom.append(form, dom.$('button.drox-ports-btn.drox-ports-btn-primary')) as HTMLButtonElement;
		addBtn.type = 'button';
		addBtn.textContent = localize('drox.ports.toolAdd', 'Add tool');
		addBtn.onclick = () => void this.portsService.addTool({
			label: labelInput.value,
			command: commandInput.value,
			args: splitArgs(argsInput.value),
		}).then(() => {
			labelInput.value = '';
		}).catch(err => this.notificationService.error(String(err)));

		const tools = this.portsService.tools;
		if (!tools.length) {
			dom.append(section, dom.$('p.drox-ports-muted', undefined, localize(
				'drox.ports.toolsEmpty',
				'No tool yet — add one above (saved in user settings).',
			)));
			return;
		}

		const list = dom.append(section, dom.$('ul.drox-ports-list'));
		for (const tool of tools) {
			appendToolRow(list, tool, this.portsService.defaultToolId, {
				onDefault: () => void this.portsService.setDefaultToolId(tool.id).catch(err => this.notificationService.error(String(err))),
				onRemove: () => void this.portsService.removeTool(tool.id).catch(err => this.notificationService.error(String(err))),
			});
		}
	}

	private _renderForwardsSection(parent: HTMLElement): void {
		const section = dom.append(parent, dom.$('.drox-ports-section'));
		dom.append(section, dom.$('h4', undefined, localize('drox.ports.forwards', 'Forwards')));
		dom.append(section, dom.$('p.drox-ports-muted', undefined, localize(
			'drox.ports.forwardsHint',
			'Workspace-scoped when a folder is open. Start runs the selected external tool.',
		)));

		const form = dom.append(section, dom.$('.drox-ports-form'));
		const labelInput = dom.append(form, dom.$('input.drox-ports-field')) as HTMLInputElement;
		labelInput.placeholder = localize('drox.ports.fwdLabelPh', 'Label (e.g. Vite)');
		const remoteHost = dom.append(form, dom.$('input.drox-ports-field')) as HTMLInputElement;
		remoteHost.placeholder = localize('drox.ports.fwdRemoteHostPh', 'Remote host (e.g. 127.0.0.1)');
		remoteHost.value = '127.0.0.1';
		const row = dom.append(form, dom.$('.drox-ports-row'));
		const remotePort = dom.append(row, dom.$('input.drox-ports-field.drox-ports-field-sm')) as HTMLInputElement;
		remotePort.type = 'number';
		remotePort.placeholder = localize('drox.ports.fwdRemotePortPh', 'Remote port');
		remotePort.value = '5173';
		const localPort = dom.append(row, dom.$('input.drox-ports-field.drox-ports-field-sm')) as HTMLInputElement;
		localPort.type = 'number';
		localPort.placeholder = localize('drox.ports.fwdLocalPortPh', 'Local port');
		localPort.value = '5173';

		const toolSelect = dom.append(form, dom.$('select.drox-ports-field')) as HTMLSelectElement;
		const defOpt = document.createElement('option');
		defOpt.value = '';
		defOpt.textContent = this.portsService.defaultToolId
			? localize('drox.ports.toolDefault', 'Default tool ({0})', this.portsService.defaultToolId)
			: localize('drox.ports.toolDefaultNone', 'Default tool (none set)');
		toolSelect.appendChild(defOpt);
		for (const tool of this.portsService.tools) {
			const opt = document.createElement('option');
			opt.value = tool.id;
			opt.textContent = `${tool.label} (${tool.id})`;
			toolSelect.appendChild(opt);
		}

		const onReady = dom.append(form, dom.$('select.drox-ports-field')) as HTMLSelectElement;
		for (const [value, text] of [
			['preview', localize('drox.ports.onReadyPreview', 'On ready: open preview')],
			['browser', localize('drox.ports.onReadyBrowser', 'On ready: open browser')],
			['notify', localize('drox.ports.onReadyNotify', 'On ready: notify')],
			['none', localize('drox.ports.onReadyNone', 'On ready: none')],
		] as const) {
			const opt = document.createElement('option');
			opt.value = value;
			opt.textContent = text;
			onReady.appendChild(opt);
		}

		const addBtn = dom.append(form, dom.$('button.drox-ports-btn.drox-ports-btn-primary')) as HTMLButtonElement;
		addBtn.type = 'button';
		addBtn.textContent = localize('drox.ports.fwdAdd', 'Add forward');
		addBtn.onclick = () => {
			const rp = Number(remotePort.value);
			const lp = Number(localPort.value);
			void this.portsService.addForward({
				label: labelInput.value,
				remoteHost: remoteHost.value,
				remotePort: rp,
				localPort: Number.isFinite(lp) && lp > 0 ? lp : rp,
				toolId: toolSelect.value || undefined,
				onReady: onReady.value as IDroxPortsForward['onReady'],
			}).then(() => {
				labelInput.value = '';
			}).catch(err => this.notificationService.error(String(err)));
		};

		const forwards = this.portsService.forwards;
		if (!forwards.length) {
			dom.append(section, dom.$('p.drox-ports-muted', undefined, localize(
				'drox.ports.forwardsEmpty',
				'No forwards yet — add one above.',
			)));
			return;
		}

		const list = dom.append(section, dom.$('ul.drox-ports-list'));
		for (const fwd of forwards) {
			appendForwardRow(list, fwd, this.portsService, this.notificationService);
		}
	}
}

function splitArgs(raw: string): string[] {
	const out: string[] = [];
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(raw)) !== null) {
		out.push(m[1] ?? m[2] ?? m[3] ?? '');
	}
	return out.filter(Boolean);
}

function appendToolRow(
	list: HTMLElement,
	tool: IDroxPortsTool,
	defaultToolId: string | undefined,
	actions: { onDefault: () => void; onRemove: () => void },
): void {
	const item = dom.append(list, dom.$('li.drox-ports-item'));
	const head = dom.append(item, dom.$('.drox-ports-item-head'));
	dom.append(head, dom.$('span.drox-ports-item-title', undefined, tool.label));
	if (tool.id === defaultToolId) {
		dom.append(head, dom.$('span.drox-ports-status.is-up', undefined, localize('drox.ports.defaultBadge', 'default')));
	}
	dom.append(item, dom.$('p.drox-ports-item-meta', undefined, `${tool.command} ${tool.args.join(' ')}`));
	const row = dom.append(item, dom.$('.drox-ports-item-actions'));
	if (tool.id !== defaultToolId) {
		const defBtn = dom.append(row, dom.$('button.drox-ports-btn.drox-ports-btn-ghost')) as HTMLButtonElement;
		defBtn.type = 'button';
		defBtn.textContent = localize('drox.ports.setDefault', 'Set default');
		defBtn.onclick = () => actions.onDefault();
	}
	const del = dom.append(row, dom.$('button.drox-ports-btn.drox-ports-btn-ghost')) as HTMLButtonElement;
	del.type = 'button';
	del.textContent = localize('drox.ports.remove', 'Remove');
	del.onclick = () => actions.onRemove();
}

function appendForwardRow(
	list: HTMLElement,
	fwd: IDroxPortsForward,
	ports: IDroxPortsService,
	notification: INotificationService,
): void {
	const item = dom.append(list, dom.$('li.drox-ports-item'));
	const head = dom.append(item, dom.$('.drox-ports-item-head'));
	dom.append(head, dom.$('span.drox-ports-item-title', undefined, fwd.label));
	const runtime = ports.getRuntime(fwd.id);
	const status = runtime?.status ?? 'idle';
	const statusEl = dom.append(head, dom.$(`span.drox-ports-status.is-${status}`, undefined, status));
	if (runtime?.error) {
		statusEl.title = runtime.error;
	}
	dom.append(item, dom.$('p.drox-ports-item-meta', undefined,
		`${fwd.localHost}:${fwd.localPort} ← ${fwd.remoteHost}:${fwd.remotePort}` +
		(fwd.toolId ? ` · tool ${fwd.toolId}` : ''),
	));
	const row = dom.append(item, dom.$('.drox-ports-item-actions'));
	const start = dom.append(row, dom.$('button.drox-ports-btn.drox-ports-btn-ghost')) as HTMLButtonElement;
	start.type = 'button';
	start.textContent = localize('drox.ports.start', 'Start');
	start.disabled = status === 'starting' || status === 'up' || status === 'stopping';
	start.onclick = () => void ports.startForward(fwd.id).catch(err => notification.error(String(err)));

	const stop = dom.append(row, dom.$('button.drox-ports-btn.drox-ports-btn-ghost')) as HTMLButtonElement;
	stop.type = 'button';
	stop.textContent = localize('drox.ports.stop', 'Stop');
	stop.disabled = status === 'idle' || status === 'stopping';
	stop.onclick = () => void ports.stopForward(fwd.id).catch(err => notification.error(String(err)));

	const open = dom.append(row, dom.$('button.drox-ports-btn.drox-ports-btn-ghost')) as HTMLButtonElement;
	open.type = 'button';
	open.textContent = localize('drox.ports.open', 'Open');
	open.onclick = () => void ports.openForward(fwd.id).catch(err => notification.error(String(err)));

	const del = dom.append(row, dom.$('button.drox-ports-btn.drox-ports-btn-ghost')) as HTMLButtonElement;
	del.type = 'button';
	del.textContent = localize('drox.ports.remove', 'Remove');
	del.onclick = () => void ports.removeForward(fwd.id).catch(err => notification.error(String(err)));
}
