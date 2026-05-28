/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { DataTransfers } from '../../../../base/browser/dnd.js';

import { addDisposableListener, DragAndDropObserver, EventType } from '../../../../base/browser/dom.js';

import { CodeWindow } from '../../../../base/browser/window.js';

import { UriList } from '../../../../base/common/dataTransfer.js';

import { Disposable } from '../../../../base/common/lifecycle.js';

import { Mimes } from '../../../../base/common/mime.js';

import { basename } from '../../../../base/common/path.js';

import { URI } from '../../../../base/common/uri.js';

import { CodeDataTransfers, containsDragType, extractEditorsDropData } from '../../../../platform/dnd/browser/dnd.js';

import { IFileService } from '../../../../platform/files/common/files.js';

import { ILogService } from '../../../../platform/log/common/log.js';

import { IDroxAttachmentPayload, isImagePath, mimeFromImagePath, toImageDataUrl } from '../common/droxAttachments.js';



export interface IDroxChatDropResult {

	readonly uris: readonly string[];

	readonly attachments: readonly IDroxAttachmentPayload[];

}



export interface IDroxChatDragAndDropDelegate {

	onDragHover(active: boolean): void;

	/** URI brutes lues pendant le survol (dataTransfer VS Code, hors webview). */

	onDragOverPeek?(uris: readonly string[]): void;

	onDropResult(result: IDroxChatDropResult): void;

}



/** Extrait les URI du drag VS Code sans I/O (pour cache survol / drop webview). */

export function peekDropUrisFromEvent(e: DragEvent): string[] {

	const uriKeys = new Set<string>();

	const uris: string[] = [];

	const add = (raw: string): void => {

		const key = raw.toLowerCase();

		if (uriKeys.has(key)) {

			return;

		}

		uriKeys.add(key);

		uris.push(raw);

	};



	for (const input of extractEditorsDropData(e)) {

		if (input.resource) {

			add(input.resource.toString());

		}

	}



	const internal = e.dataTransfer?.getData(DataTransfers.INTERNAL_URI_LIST);

	if (internal) {

		for (const raw of UriList.parse(internal)) {

			add(raw);

		}

	}



	const uriList = e.dataTransfer?.getData(Mimes.uriList);

	if (uriList) {

		for (const raw of UriList.parse(uriList)) {

			add(raw);

		}

	}



	return uris;

}



/**

 * Drag & drop explorateur → chat Drox.

 * Les événements sont lus au niveau fenêtre + test de position sur le webview

 * (l'iframe ne reçoit pas les URI VS Code).

 */

export class DroxChatDragAndDrop extends Disposable {



	private hovering = false;



	constructor(

		private readonly hitTarget: HTMLElement,

		targetWindow: CodeWindow,

		private readonly hitTestElement: HTMLElement,

		private readonly delegate: IDroxChatDragAndDropDelegate,

		private readonly fileService: IFileService,

		private readonly logService: ILogService,

	) {

		super();



		const isOver = (e: DragEvent): boolean => {

			const r = this.hitTestElement.getBoundingClientRect();

			if (r.width <= 0 || r.height <= 0) {

				return false;

			}

			return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;

		};



		const onWindowDrag = (e: DragEvent): void => {

			if (!isOver(e)) {

				this.clearHover();

				return;

			}

			if (!isLikelyChatDrag(e)) {

				this.clearHover();

				return;

			}

			e.preventDefault();

			if (e.dataTransfer) {

				e.dataTransfer.dropEffect = 'copy';

			}

			this.delegate.onDragOverPeek?.(peekDropUrisFromEvent(e));

			if (!this.hovering) {

				this.hovering = true;

				this.delegate.onDragHover(true);

			}

		};



		this._register(addDisposableListener(targetWindow, EventType.DRAG_OVER, onWindowDrag));

		this._register(addDisposableListener(targetWindow, EventType.DRAG, onWindowDrag));



		const onWindowDrop = (e: DragEvent): void => {

			const wasHovering = this.hovering;

			this.clearHover();

			if (!wasHovering || !isLikelyChatDrag(e) || !isOver(e)) {

				return;

			}

			e.preventDefault();

			void this.handleDrop(e);

		};



		this._register(addDisposableListener(targetWindow, EventType.DROP, onWindowDrop));

		this._register(addDisposableListener(targetWindow, EventType.DRAG_END, () => this.clearHover()));



		// Fichiers OS lâchés directement sur le conteneur webview

		let dragDepth = 0;

		this._register(new DragAndDropObserver(this.hitTarget, {

			onDragOver: e => {

				if (!isLikelyChatDrag(e)) {

					return;

				}

				e.preventDefault();

				e.stopPropagation();

				if (e.dataTransfer) {

					e.dataTransfer.dropEffect = 'copy';

				}

				this.delegate.onDragOverPeek?.(peekDropUrisFromEvent(e));

				if (dragDepth === 0) {

					this.hovering = true;

					this.delegate.onDragHover(true);

				}

				dragDepth++;

			},

			onDragLeave: () => {

				dragDepth = Math.max(0, dragDepth - 1);

				if (dragDepth === 0) {

					this.clearHover();

				}

			},

			onDrop: e => {

				e.preventDefault();

				e.stopPropagation();

				dragDepth = 0;

				this.clearHover();

				void this.handleDrop(e);

			},

		}));

	}



	private clearHover(): void {

		if (!this.hovering) {

			return;

		}

		this.hovering = false;

		this.delegate.onDragHover(false);

	}



	private async handleDrop(e: DragEvent): Promise<void> {

		if (!isLikelyChatDrag(e)) {

			return;

		}

		try {

			const result = await this.resolveDrop(e);

			if (result.uris.length > 0 || result.attachments.length > 0) {

				this.delegate.onDropResult(result);

			}

		} catch (err) {

			this.logService.warn('[Drox] chat drop failed', err);

		}

	}



	private async resolveDrop(e: DragEvent): Promise<IDroxChatDropResult> {

		const uriKeys = new Set<string>();

		const uris: string[] = [];

		const attachments: IDroxAttachmentPayload[] = [];



		const addUri = (uri: URI): void => {

			const key = uri.toString().toLowerCase();

			if (uriKeys.has(key)) {

				return;

			}

			uriKeys.add(key);

			uris.push(uri.toString());

		};



		const editorInputs = extractEditorsDropData(e);

		for (const input of editorInputs) {

			if (input.resource) {

				await this.classifyResource(input.resource, addUri, attachments);

			}

		}



		const internal = e.dataTransfer?.getData(DataTransfers.INTERNAL_URI_LIST);

		if (internal) {

			for (const raw of UriList.parse(internal)) {

				try {

					await this.classifyResource(URI.parse(raw), addUri, attachments);

				} catch {

					// ignore invalid URI

				}

			}

		}



		const uriList = e.dataTransfer?.getData(Mimes.uriList);

		if (uriList && !internal) {

			for (const raw of UriList.parse(uriList)) {

				try {

					await this.classifyResource(URI.parse(raw), addUri, attachments);

				} catch {

					// ignore invalid URI

				}

			}

		}



		return { uris, attachments };

	}



	/** Résout des URI déjà extraites (ex. drop signalé par le webview). */

	async resolvePeekedUris(peeked: readonly string[]): Promise<IDroxChatDropResult> {

		const uriKeys = new Set<string>();

		const uris: string[] = [];

		const attachments: IDroxAttachmentPayload[] = [];



		const addUri = (uri: URI): void => {

			const key = uri.toString().toLowerCase();

			if (uriKeys.has(key)) {

				return;

			}

			uriKeys.add(key);

			uris.push(uri.toString());

		};



		for (const raw of peeked) {

			try {

				await this.classifyResource(URI.parse(raw), addUri, attachments);

			} catch {

				// ignore invalid URI

			}

		}



		return { uris, attachments };

	}



	private async classifyResource(

		uri: URI,

		addUri: (uri: URI) => void,

		attachments: IDroxAttachmentPayload[],

	): Promise<void> {

		try {

			const stat = await this.fileService.stat(uri);

			if (stat.isDirectory) {

				addUri(uri);

				return;

			}

			if (stat.isFile && isImagePath(uri.fsPath)) {

				const content = await this.fileService.readFile(uri);

				attachments.push({

					name: basename(uri.fsPath),

					mime: mimeFromImagePath(uri.fsPath),

					dataUrl: toImageDataUrl(uri.fsPath, content.value),

				});

				return;

			}

		} catch {

			// fall through: still add as reference

		}

		addUri(uri);

	}

}



function isLikelyChatDrag(e: DragEvent): boolean {

	if (isSupportedChatDrop(e)) {

		return true;

	}

	const types = e.dataTransfer?.types;

	if (!types?.length) {

		return false;

	}

	for (let i = 0; i < types.length; i++) {

		const t = types[i].toLowerCase();

		if (t.includes('resource') || t.includes('uri') || t === 'files' || t.includes('file')
			|| t.includes('codeeditors') || t.includes('codefiles') || t.includes('vscode')) {

			return true;

		}

	}

	return false;

}



function isSupportedChatDrop(e: DragEvent): boolean {

	return containsDragType(e, CodeDataTransfers.EDITORS)

		|| containsDragType(e, DataTransfers.RESOURCES)

		|| containsDragType(e, DataTransfers.INTERNAL_URI_LIST)

		|| containsDragType(e, Mimes.uriList)

		|| containsDragType(e, DataTransfers.FILES)

		|| containsDragType(e, CodeDataTransfers.FILES);

}


