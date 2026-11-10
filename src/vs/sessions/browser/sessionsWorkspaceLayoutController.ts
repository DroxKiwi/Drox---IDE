/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService } from '../../platform/storage/common/storage.js';
import { Parts } from '../../workbench/services/layout/browser/layoutService.js';
import {
	ISessionsLayoutByWorkspaceMemento,
	ISessionsPartSizesSnapshot,
	ISessionsWorkspaceLayoutSnapshot,
	loadSessionsLayoutByWorkspaceMemento,
	resolveSessionsWorkspaceLayoutSnapshot,
	saveSessionsLayoutByWorkspaceMemento,
	SESSIONS_AGENTS_WINDOW_LAYOUT_KEY,
} from './sessionsWorkspaceLayoutStore.js';

export interface ISessionsWorkspaceLayoutVisibility {
	editor: boolean;
	auxiliaryBar: boolean;
	sidebar: boolean;
	panel: boolean;
	sessions: boolean;
}

export type SessionsLayoutPart = 'sidebar' | 'auxiliaryBar' | 'sessions' | 'editor' | 'panel';

export interface ISessionsWorkspaceLayoutHost {
	storageService(): IStorageService;
	readonly partVisibility: ISessionsWorkspaceLayoutVisibility;
	isPhone(): boolean;
	hasGrid(): boolean;
	measure(part: SessionsLayoutPart, dimension: 'width' | 'height', visible: boolean): number | undefined;
	getPolicyPartSizes(): { sideBarSize: number; auxiliaryBarSize: number; panelSize: number };
	setSideBarHidden(hidden: boolean): void;
	setAuxiliaryBarHidden(hidden: boolean): void;
	setEditorHidden(hidden: boolean): void;
	setPanelHidden(hidden: boolean): void;
	resize(part: Parts, visible: boolean, width?: number, height?: number): void;
	layout(): void;
}

/** Remembers Agents window part sizes and visibility across reloads. */
export class SessionsWorkspaceLayoutController {

	private _memento: ISessionsLayoutByWorkspaceMemento = {};
	private _workspaceKey: string | undefined;
	private _restoring = false;
	private _savedPartSizes: ISessionsPartSizesSnapshot = {};

	constructor(private readonly _host: ISessionsWorkspaceLayoutHost) { }

	get savedPartSizes(): ISessionsPartSizesSnapshot {
		return this._savedPartSizes;
	}

	init(): void {
		this._memento = loadSessionsLayoutByWorkspaceMemento(this._host.storageService());
		this._workspaceKey = SESSIONS_AGENTS_WINDOW_LAYOUT_KEY;
		const snapshot = resolveSessionsWorkspaceLayoutSnapshot(this._memento, this._workspaceKey);
		if (snapshot?.partSizes) {
			this._savedPartSizes = { ...snapshot.partSizes };
		}
		if (this._workspaceKey && snapshot) {
			saveSessionsLayoutByWorkspaceMemento(this._host.storageService(), this._memento);
		}
	}

	/**
	 * Overlays the persisted part visibility on top of the current
	 * (layout-policy default) visibility. Must run before the context keys
	 * handler reads the initial visibility.
	 */
	applyPersistedPartVisibility(): void {
		if (this._host.isPhone()) {
			return;
		}

		const snapshot = resolveSessionsWorkspaceLayoutSnapshot(this._memento, this._workspaceKey);
		const savedPartVisibility = snapshot?.partVisibility ?? {};
		const visibility = this._host.partVisibility;
		visibility.editor = savedPartVisibility.editor ?? visibility.editor;
		visibility.auxiliaryBar = savedPartVisibility.auxiliaryBar ?? visibility.auxiliaryBar;
		visibility.sidebar = savedPartVisibility.sidebar ?? visibility.sidebar;
		visibility.panel = savedPartVisibility.panel ?? visibility.panel;
	}

	savePartVisibility(): void {
		if (this._restoring) {
			return;
		}
		this.persist();
	}

	persist(): void {
		if (this._host.isPhone()) {
			return;
		}

		const key = this._workspaceKey ?? SESSIONS_AGENTS_WINDOW_LAYOUT_KEY;
		if (!key) {
			return;
		}

		const visibility = this._host.partVisibility;
		this._memento[key] = {
			partVisibility: {
				editor: visibility.editor,
				auxiliaryBar: visibility.auxiliaryBar,
				sidebar: visibility.sidebar,
				panel: visibility.panel,
			},
			partSizes: this._captureCurrentPartSizes(),
		};
		saveSessionsLayoutByWorkspaceMemento(this._host.storageService(), this._memento);
	}

	onWorkspaceFoldersChanged(): void {
		const newKey = SESSIONS_AGENTS_WINDOW_LAYOUT_KEY;
		if (newKey === this._workspaceKey) {
			return;
		}

		this.persist();
		this._workspaceKey = newKey;
		const snapshot = resolveSessionsWorkspaceLayoutSnapshot(this._memento, newKey);
		this._savedPartSizes = snapshot?.partSizes ? { ...snapshot.partSizes } : {};
		if (newKey && snapshot) {
			saveSessionsLayoutByWorkspaceMemento(this._host.storageService(), this._memento);
		}
		this._applyLayoutSnapshot(snapshot);
	}

	private _captureCurrentPartSizes(): ISessionsPartSizesSnapshot {
		if (!this._host.hasGrid()) {
			return { ...this._savedPartSizes };
		}

		const visibility = this._host.partVisibility;
		const measure = (part: SessionsLayoutPart, dimension: 'width' | 'height', visible: boolean): number | undefined => {
			return this._host.measure(part, dimension, visible);
		};

		return {
			sidebar: measure('sidebar', 'width', visibility.sidebar),
			auxiliaryBar: measure('auxiliaryBar', 'width', visibility.auxiliaryBar),
			sessions: measure('sessions', 'width', visibility.sessions),
			editor: measure('editor', 'width', visibility.editor),
			panel: measure('panel', 'height', visibility.panel),
		};
	}

	private _applyLayoutSnapshot(snapshot: ISessionsWorkspaceLayoutSnapshot | undefined): void {
		if (!this._host.hasGrid()) {
			return;
		}

		this._restoring = true;
		try {
			const savedPartVisibility = snapshot?.partVisibility;
			if (savedPartVisibility?.sidebar !== undefined) {
				this._host.setSideBarHidden(!savedPartVisibility.sidebar);
			}
			if (savedPartVisibility?.auxiliaryBar !== undefined) {
				this._host.setAuxiliaryBarHidden(!savedPartVisibility.auxiliaryBar);
			}
			if (savedPartVisibility?.editor !== undefined) {
				this._host.setEditorHidden(!savedPartVisibility.editor);
			}
			if (savedPartVisibility?.panel !== undefined) {
				this._host.setPanelHidden(!savedPartVisibility.panel);
			}
			this._applyPartSizesFromSaved();
			this._host.layout();
		} finally {
			this._restoring = false;
		}
	}

	private _applyPartSizesFromSaved(): void {
		if (!this._host.hasGrid()) {
			return;
		}

		const policySizes = this._host.getPolicyPartSizes();
		const visibility = this._host.partVisibility;
		this._host.resize(Parts.SIDEBAR_PART, visibility.sidebar, this._savedPartSizes.sidebar ?? policySizes.sideBarSize);
		this._host.resize(Parts.AUXILIARYBAR_PART, visibility.auxiliaryBar, this._savedPartSizes.auxiliaryBar ?? policySizes.auxiliaryBarSize);
		this._host.resize(Parts.SESSIONS_PART, visibility.sessions, this._savedPartSizes.sessions);
		this._host.resize(Parts.EDITOR_PART, visibility.editor, this._savedPartSizes.editor);
		this._host.resize(Parts.PANEL_PART, visibility.panel, undefined, this._savedPartSizes.panel ?? policySizes.panelSize);
	}
}
