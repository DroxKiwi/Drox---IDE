/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append, getWindow } from '../../../../../base/browser/dom.js';
import { URI } from '../../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService, ServicesAccessor, createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IDroxAgentsComposerDroxChatHost } from '../agents/droxAgentsComposerDroxChatHost.js';
import { resolveDroxIdeChatViewId } from '../chat/droxIdeChatViewRoute.js';
import { DROX_SESSIONS_PROVIDER_ID } from '../../common/droxAgentsSession.js';
import { DroxCommands, DroxViews } from '../../common/drox.js';
import { ISessionsManagementService } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
import { DROX_AGENTS_TUTORIAL_STEPS } from './droxAgentsTutorialSteps.js';
import { DROX_TUTORIAL_STEPS, DroxTutorialOpen, DroxTutorialStep } from './droxTutorialSteps.js';

export const IDroxTutorialService = createDecorator<IDroxTutorialService>('droxTutorialService');

export interface IDroxTutorialService {
	readonly _serviceBrand: undefined;
	readonly active: boolean;
	readonly onDidChange: Event<void>;
	toggle(): void;
}

export class DroxTutorialService extends Disposable implements IDroxTutorialService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly session = this._register(new DisposableStore());
	private root: HTMLElement | undefined;
	private spot: HTMLElement | undefined;
	private card: HTMLElement | undefined;
	private title: HTMLElement | undefined;
	private body: HTMLElement | undefined;
	private link: HTMLAnchorElement | undefined;
	private count: HTMLElement | undefined;
	private back: HTMLButtonElement | undefined;
	private next: HTMLButtonElement | undefined;
	private index = 0;
	private generation = 0;

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IViewsService private readonly viewsService: IViewsService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IDroxAgentsComposerDroxChatHost private readonly chatHost: IDroxAgentsComposerDroxChatHost,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	private steps(): readonly DroxTutorialStep[] {
		return this.environmentService.isSessionsWindow ? DROX_AGENTS_TUTORIAL_STEPS : DROX_TUTORIAL_STEPS;
	}

	get active(): boolean {
		return !!this.root;
	}

	toggle(): void {
		if (this.root) {
			this.stop();
			return;
		}
		this.open();
	}

	private open(): void {
		this.session.clear();
		this.index = 0;
		const parent = getWindow(this.layoutService.mainContainer).document.body;
		const root = append(parent, $('div.drox-tutorial'));
		this.copyTheme(root);
		this.root = root;
		this.spot = append(root, $('div.drox-tutorial-spot'));
		const card = append(root, $('div.drox-tutorial-card'));
		this.card = card;
		this.count = append(card, $('p.drox-tutorial-count'));
		this.title = append(card, $('h2.drox-tutorial-title'));
		this.body = append(card, $('p.drox-tutorial-body'));
		const link = append(card, $('a.drox-tutorial-link')) as HTMLAnchorElement;
		link.target = '_blank';
		link.rel = 'noreferrer';
		this.link = link;
		this.session.add(this.disposableListener(link, 'click', event => {
			event.preventDefault();
			event.stopPropagation();
			if (link.href) {
				void this.openerService.open(URI.parse(link.href), { openExternal: true });
			}
		}));
		const actions = append(card, $('div.drox-tutorial-actions'));
		this.back = this.button(actions, 'Back', () => this.move(-1));
		this.next = this.button(actions, 'Next', () => this.move(1));
		this.button(actions, 'Stop', () => this.stop());

		const targetWindow = getWindow(parent);
		this.session.add(this.disposableListener(targetWindow, 'resize', () => this.paintFrame()));
		this.session.add(this.disposableListener(targetWindow, 'keydown', event => {
			if (event instanceof KeyboardEvent && event.key === 'Escape') {
				this.stop();
			}
		}));
		void this.go(0);
		this._onDidChange.fire();
	}

	private button(parent: HTMLElement, label: string, run: () => void): HTMLButtonElement {
		const button = append(parent, $('button.drox-tutorial-button')) as HTMLButtonElement;
		button.type = 'button';
		button.textContent = label;
		if (label === 'Stop') {
			button.classList.add('drox-tutorial-stop');
		}
		this.session.add(this.disposableListener(button, 'click', event => {
			event.preventDefault();
			event.stopPropagation();
			run();
		}));
		return button;
	}

	private move(delta: number): void {
		const last = Math.max(0, this.steps().length - 1);
		void this.go(Math.min(last, Math.max(0, this.index + delta)));
	}

	private async go(index: number): Promise<void> {
		const generation = ++this.generation;
		this.index = index;
		this.paintText();
		const step = this.steps()[index];
		this.layoutService.mainContainer.classList.toggle('drox-tutorial-show-session-tools', !!step?.revealSessionTools);
		await this.prepare(step);
		if (generation !== this.generation || !this.root) {
			return;
		}
		this.paintFrame();
		this.followTarget(generation);
	}

	private paintText(): void {
		if (!this.title || !this.body || !this.link || !this.count || !this.back || !this.next) {
			return;
		}
		const steps = this.steps();
		const step: DroxTutorialStep | undefined = steps[this.index];
		const total = steps.length;
		this.count.textContent = total === 0 ? 'Tutorial' : `${this.index + 1} / ${total}`;
		this.title.textContent = step?.title ?? 'Tutorial';
		this.body.textContent = step?.body ?? 'No steps yet.';
		if (step?.link) {
			this.link.hidden = false;
			this.link.textContent = step.link.label;
			this.link.href = step.link.href;
		} else {
			this.link.hidden = true;
			this.link.removeAttribute('href');
		}
		this.back.disabled = this.index <= 0;
		this.next.disabled = total === 0 || this.index >= total - 1;
	}

	private paintFrame(): void {
		if (!this.root || !this.spot || !this.card) {
			return;
		}
		const step = this.steps()[this.index];
		const frame = this.frameFor(step?.target) ?? this.frameFor(step?.fallback);
		if (!frame) {
			this.spot.classList.add('drox-tutorial-spot-hidden');
			this.root.classList.add('drox-tutorial-full');
			this.placeCard(undefined);
			return;
		}
		this.root.classList.remove('drox-tutorial-full');
		this.spot.classList.remove('drox-tutorial-spot-hidden');
		this.spot.style.top = `${frame.top}px`;
		this.spot.style.left = `${frame.left}px`;
		this.spot.style.width = `${frame.width}px`;
		this.spot.style.height = `${frame.height}px`;
		this.placeCard(frame);
	}

	/** The chat toolbar can finish laying out after the step opens. */
	private followTarget(generation: number): void {
		const step = this.steps()[this.index];
		if (!step?.target && !step?.fallback) {
			return;
		}
		let tries = 0;
		const tick = () => {
			if (generation !== this.generation || !this.root) {
				return;
			}
			this.paintFrame();
			if (!this.frameFor(step.target) && !this.frameFor(step.fallback) && tries++ < 12) {
				setTimeout(tick, 50);
			}
		};
		setTimeout(tick, 50);
	}

	private frameFor(selector: string | undefined): DOMRect | undefined {
		if (!selector) {
			return undefined;
		}
		const nodes = getWindow(this.layoutService.mainContainer).document.querySelectorAll(selector);
		for (const node of nodes) {
			this.revealInSidebar(node);
			const rect = node.getBoundingClientRect();
			if (rect.width < 2 || rect.height < 2) {
				continue;
			}
			const pad = 6;
			return new DOMRect(rect.left - pad, rect.top - pad, rect.width + pad * 2, rect.height + pad * 2);
		}
		return undefined;
	}

	private placeCard(frame: DOMRect | undefined): void {
		if (!this.card) {
			return;
		}
		const targetWindow = getWindow(this.layoutService.mainContainer);
		const margin = 16;
		const width = Math.min(360, targetWindow.innerWidth - margin * 2);
		this.card.style.width = `${width}px`;
		const cardHeight = Math.max(this.card.offsetHeight, 150);
		const viewW = targetWindow.innerWidth;
		const viewH = targetWindow.innerHeight;
		if (!frame) {
			this.card.style.top = `${Math.max(margin, (viewH - cardHeight) / 2)}px`;
			this.card.style.left = `${Math.max(margin, (viewW - width) / 2)}px`;
			return;
		}
		const spot = this.cardSpot(frame, width, cardHeight, viewW, viewH, margin);
		this.card.style.top = `${spot.top}px`;
		this.card.style.left = `${spot.left}px`;
	}

	private revealInSidebar(node: Element): void {
		const sidebar = node.closest('.part.sidebar') ?? node.closest('.part.auxiliarybar');
		if (!sidebar) {
			return;
		}
		const rect = node.getBoundingClientRect();
		const bounds = sidebar.getBoundingClientRect();
		if (rect.top < bounds.top + 8 || rect.bottom > bounds.bottom - 8) {
			node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		}
	}

	/** Keep the card off the lit control. Anything in the left sidebar gets the card in the editor. */
	private cardSpot(frame: DOMRect, width: number, cardHeight: number, viewW: number, viewH: number, margin: number): { left: number; top: number } {
		const sidebar = getWindow(this.layoutService.mainContainer).document.querySelector('.part.sidebar')?.getBoundingClientRect();
		const insideSidebar = !!sidebar && sidebar.width > 40 && frame.left >= sidebar.left - 8 && frame.right <= sidebar.right + 8;
		const showsLeftPanel = insideSidebar || (frame.left < 140 && frame.width < 80);
		const pastSidebar = sidebar && sidebar.width > 40 ? sidebar.right + 12 : frame.right + 12;
		const candidates = showsLeftPanel
			? [
				{ left: pastSidebar, top: Math.min(Math.max(margin, frame.top), viewH - margin - cardHeight) },
				{ left: frame.right + 12, top: margin },
			]
			: frame.height > 320
				? [
					{ left: Math.max(margin, Math.min(frame.left + 12, viewW - margin - width)), top: viewH - margin - cardHeight },
					{ left: Math.max(margin, frame.left), top: frame.top - 12 - cardHeight },
				]
				: [
					{ left: frame.left - 12 - width, top: Math.max(margin, Math.min(frame.top, viewH - margin - cardHeight)) },
					{ left: Math.max(margin, frame.left), top: frame.top - 12 - cardHeight },
					{ left: frame.right + 12, top: Math.max(margin, frame.top) },
					{ left: Math.max(margin, frame.left), top: frame.bottom + 12 },
				];
		for (const candidate of candidates) {
			if (this.cardFits(candidate, width, cardHeight, viewW, viewH, margin) && !this.cardCovers(candidate, width, cardHeight, frame)) {
				return candidate;
			}
		}
		const fallback = candidates[0];
		return {
			left: Math.max(margin, Math.min(fallback.left, viewW - margin - width)),
			top: Math.max(margin, Math.min(fallback.top, viewH - margin - cardHeight)),
		};
	}

	private cardFits(spot: { left: number; top: number }, width: number, cardHeight: number, viewW: number, viewH: number, margin: number): boolean {
		return spot.left >= margin && spot.top >= margin && spot.left + width <= viewW - margin && spot.top + cardHeight <= viewH - margin;
	}

	private cardCovers(spot: { left: number; top: number }, width: number, cardHeight: number, frame: DOMRect): boolean {
		return spot.left < frame.right && spot.left + width > frame.left && spot.top < frame.bottom && spot.top + cardHeight > frame.top;
	}

	private async prepare(step: DroxTutorialStep | undefined): Promise<void> {
		if (step?.ensureHistory && this.environmentService.isSessionsWindow) {
			await this.ensureHistoryCard();
		}
		const open = step?.open;
		if (!open) {
			this.dismissChatPanels();
			return;
		}
		if (this.isChatOpen(open)) {
			if (!this.environmentService.isSessionsWindow) {
				await this.revealChat();
			}
		} else {
			this.dismissChatPanels();
			if (this.environmentService.isSessionsWindow) {
				this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
			} else {
				this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
			}
			await this.viewsService.openViewContainer(this.sidebarId(open), true);
			if (step?.map) {
				await this.revealMap();
			}
			await this.settle(80);
			return;
		}
		if (open === 'model') {
			this.chatFn()?.closeGeneralSettingsPanel?.();
			this.dismissWizard();
			await this.chatHost.toggleModelSettingsPanel();
			if (this.chatState()?.rolePanelOpen !== 'architect') {
				this.chatFn()?.openRoleModelPanel?.();
			}
		} else if (open === 'server') {
			this.chatFn()?.closeRoleModelPanel?.();
			await this.chatHost.openConnectionSetup();
			this.dismissWizard();
		} else if (open === 'wizard' || open === 'wizard-sample') {
			this.chatFn()?.closeRoleModelPanel?.();
			await this.chatHost.openConnectionSetup();
			this.chatFn()?.openConnectionWizard?.();
			if (open === 'wizard-sample') {
				this.fillSampleConnection();
			}
			this.freezeWizard();
		} else {
			this.dismissChatPanels();
		}
		await this.settle(40);
	}

	private isChatOpen(open: DroxTutorialOpen): boolean {
		return open === 'chat' || open === 'chip' || open === 'model' || open === 'server' || open === 'wizard' || open === 'wizard-sample';
	}

	private sidebarId(open: DroxTutorialOpen): string {
		const sessions = this.environmentService.isSessionsWindow;
		switch (open) {
			case 'regulation': return sessions ? DroxViews.RegulationSessionsViewContainerId : DroxViews.RegulationViewContainerId;
			case 'traffic': return sessions ? DroxViews.TrafficSessionsViewContainerId : DroxViews.TrafficViewContainerId;
			case 'ports': return sessions ? DroxViews.PortsSessionsViewContainerId : DroxViews.PortsViewContainerId;
			case 'sdtcm': return sessions ? DroxViews.SdtcmSessionsViewContainerId : DroxViews.SdtcmViewContainerId;
			default: return sessions ? DroxViews.CodebaseSessionsViewContainerId : DroxViews.CodebaseViewContainerId;
		}
	}

	/** A discussion card, so the history icons exist. Does not send a prompt. */
	private async ensureHistoryCard(): Promise<void> {
		this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
		this.instantiationService.invokeFunction((accessor: ServicesAccessor) => {
			const sessions = accessor.get(ISessionsManagementService);
			const hasCard = sessions.getSessions().some(session =>
				session.providerId === DROX_SESSIONS_PROVIDER_ID && !session.isArchived.get());
			if (hasCard) {
				return;
			}
			const workspace = accessor.get(IWorkspaceContextService);
			const active = accessor.get(ISessionsService).activeSession.get();
			const folder = workspace.getWorkspace().folders[0]?.uri
				?? active?.workspace.get()?.folders[0]?.workingDirectory
				?? active?.workspace.get()?.folders[0]?.root;
			if (folder) {
				accessor.get(ISessionsService).openNewSession({ folderUri: folder, providerId: DROX_SESSIONS_PROVIDER_ID });
			}
		});
		await this.settle(120);
	}

	/** Focuses the map tab. Opening it does not start a run. */
	private async revealMap(): Promise<void> {
		await this.commandService.executeCommand(DroxCommands.OpenSdtcm);
		await this.settle(60);
	}

	private async revealChat(): Promise<void> {
		const hidden = !this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
		if (hidden) {
			this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
		}
		await this.viewsService.openView(resolveDroxIdeChatViewId(this.configurationService), false);
		if (hidden) {
			await this.settle(280);
		}
	}

	private fillSampleConnection(): void {
		const wiz = this.chatState()?.connectionWizard;
		if (!wiz) {
			return;
		}
		wiz.hosting = 'personal';
		wiz.provider = 'ollama';
		wiz.server = 'http://127.0.0.1:11434';
		wiz.apiKey = '';
		wiz.step = 3;
		wiz.testStatus = 'idle';
		wiz.testError = '';
		wiz.open = true;
		this.chatFn()?.renderConnectionWizard?.();
	}

	/** Finish is what would test the draft and store it. */
	private freezeWizard(): void {
		const wizard = getWindow(this.layoutService.mainContainer).document.getElementById('drox-connection-wizard');
		if (!wizard) {
			return;
		}
		for (const node of wizard.querySelectorAll('button, input, select')) {
			if (node instanceof HTMLButtonElement || node instanceof HTMLInputElement || node instanceof HTMLSelectElement) {
				node.disabled = true;
			}
		}
	}

	private dismissWizard(): void {
		this.chatFn()?.closeConnectionWizard?.();
	}

	private dismissChatPanels(): void {
		const fn = this.chatFn();
		fn?.closeConnectionWizard?.();
		fn?.closeRoleModelPanel?.();
		fn?.closeGeneralSettingsPanel?.();
	}

	private chatFn(): {
		openRoleModelPanel?: () => void;
		closeRoleModelPanel?: () => void;
		closeGeneralSettingsPanel?: () => void;
		openConnectionWizard?: () => void;
		closeConnectionWizard?: () => void;
		renderConnectionWizard?: () => void;
	} | undefined {
		return (globalThis as {
			DroxChat?: {
				fn?: {
					openRoleModelPanel?: () => void;
					closeRoleModelPanel?: () => void;
					closeGeneralSettingsPanel?: () => void;
					openConnectionWizard?: () => void;
					closeConnectionWizard?: () => void;
					renderConnectionWizard?: () => void;
				}
			}
		}).DroxChat?.fn;
	}

	private chatState(): {
		rolePanelOpen?: string;
		connectionWizard?: Record<string, unknown>;
	} | undefined {
		return (globalThis as { DroxChat?: { state?: ReturnType<DroxTutorialService['chatState']> } }).DroxChat?.state;
	}

	/** The card sits on document.body, outside the workbench theme scope. */
	private copyTheme(root: HTMLElement): void {
		const source = this.layoutService.mainContainer;
		const styles = getWindow(source).getComputedStyle(source);
		for (const name of ['--vscode-editorWidget-border', '--vscode-editorWidget-background', '--vscode-editorWidget-foreground', '--vscode-shadow-md', '--vscode-descriptionForeground', '--vscode-button-border', '--vscode-button-secondaryBackground', '--vscode-button-secondaryForeground', '--vscode-button-secondaryHoverBackground']) {
			const value = styles.getPropertyValue(name).trim();
			if (value) {
				root.style.setProperty(name, value);
			}
		}
	}

	private settle(ms: number): Promise<void> {
		return new Promise(resolve => {
			setTimeout(resolve, ms);
		});
	}

	private stop(): void {
		this.generation++;
		this.layoutService.mainContainer.classList.remove('drox-tutorial-show-session-tools');
		this.dismissChatPanels();
		this.session.clear();
		this.root?.remove();
		this.root = undefined;
		this.spot = undefined;
		this.card = undefined;
		this.title = undefined;
		this.body = undefined;
		this.link = undefined;
		this.count = undefined;
		this.back = undefined;
		this.next = undefined;
		this._onDidChange.fire();
	}

	private disposableListener(node: EventTarget, type: string, fn: (event: globalThis.Event) => void) {
		const listener = (event: globalThis.Event) => fn(event);
		node.addEventListener(type, listener);
		return { dispose: () => node.removeEventListener(type, listener) };
	}
}

registerSingleton(IDroxTutorialService, DroxTutorialService, InstantiationType.Delayed);
