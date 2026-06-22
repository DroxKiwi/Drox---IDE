/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dimension, findParentWithClass, getWindow } from '../../../../base/browser/dom.js';
import { WebviewWindowDragMonitor } from '../../webview/browser/webviewWindowDragMonitor.js';

import { FileAccess } from '../../../../base/common/network.js';

import { URI } from '../../../../base/common/uri.js';

import { DisposableStore, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';

import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';

import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';

import { IOpenerService } from '../../../../platform/opener/common/opener.js';

import { IThemeService } from '../../../../platform/theme/common/themeService.js';

import { ViewPane, ViewPaneShowActions } from '../../../browser/parts/views/viewPane.js';

import { IViewletViewOptions } from '../../../browser/parts/views/viewsViewlet.js';

import { IViewDescriptorService } from '../../../common/views.js';

import { IOverlayWebview, IWebviewService, WebviewContentPurpose } from '../../webview/browser/webview.js';

import { asWebviewUri } from '../../webview/common/webview.js';

import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { isDroxDevFeatureEnabled } from '../common/droxDevSurface.js';
import { formatDroxChatVersionLabel, formatDroxChatVersionTitle } from '../common/droxProductVersion.js';

import { DroxViews } from '../common/drox.js';

import { DroxChatController } from './droxChatController.js';

import { DROX_CHAT_SCRIPT_FILES, getDroxChatHtml } from './droxChatWebview.js';



export class DroxChatViewPane extends ViewPane {



	private readonly _webview = this._register(new MutableDisposable<IOverlayWebview>());

	private readonly _webviewDisposables = this._register(new DisposableStore());

	private readonly _chatController: DroxChatController;

	private _activated = false;



	private _container?: HTMLElement;

	private _resizeObserver?: ResizeObserver;



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

		@IWebviewService private readonly webviewService: IWebviewService,

		@IProductService private readonly productService: IProductService,

	) {

		super(

			{ ...options, showActions: ViewPaneShowActions.WhenExpanded },

			keybindingService,

			contextMenuService,

			configurationService,

			contextKeyService,

			viewDescriptorService,

			instantiationService,

			openerService,

			themeService,

			hoverService,

		);



		this._chatController = this._register(instantiationService.createInstance(DroxChatController));

		this._register(this.onDidChangeBodyVisibility(() => this.updateWebviewVisibility()));

	}



	override focus(): void {

		super.focus();

		this._webview.value?.focus();

	}



	protected override renderBody(container: HTMLElement): void {

		super.renderBody(container);

		this._container = container;



		if (!this._resizeObserver) {

			this._resizeObserver = new ResizeObserver(() => {

				this.layoutWebview();

			});

			this._register(toDisposable(() => {

				this._resizeObserver?.disconnect();

			}));

			this._resizeObserver.observe(container);

		}



		this.updateWebviewVisibility();

	}



	protected override layoutBody(height: number, width: number): void {

		super.layoutBody(height, width);

		this.layoutWebview(new Dimension(width, height));

	}



	private updateWebviewVisibility(): void {

		if (this.isBodyVisible()) {

			this.activateWebview();

			this._webview.value?.claim(this, getWindow(this.element), undefined);

		} else {

			this._webview.value?.release(this);

		}

	}



	private activateWebview(): void {

		if (this._activated || !this._container) {

			return;

		}



		this._activated = true;



		const mediaRoot = FileAccess.asFileUri('vs/workbench/contrib/drox/browser/media/');

		const cssUri = asWebviewUri(URI.joinPath(mediaRoot, 'droxChatMvp.css'));

		const scriptUris = DROX_CHAT_SCRIPT_FILES.map((f) => asWebviewUri(URI.joinPath(mediaRoot, f)));



		const webview = this.webviewService.createWebviewOverlay({

			providedViewType: DroxViews.ChatViewId,

			title: this.title,

			options: {

				purpose: WebviewContentPurpose.WebviewView,

				retainContextWhenHidden: false,

			},

			contentOptions: {

				allowScripts: true,

				localResourceRoots: [mediaRoot],

			},

			extension: undefined,

		});



		webview.setHtml(getDroxChatHtml(
			cssUri,
			scriptUris,
			formatDroxChatVersionLabel(this.productService),
			formatDroxChatVersionTitle(this.productService),
			isDroxDevFeatureEnabled('exportTranscript', this.productService),
		));

		this._chatController.attachWebview(webview, getWindow(this.element), this._container);

		this._webview.value = webview;

		this.layoutWebview();

		this._webviewDisposables.add(toDisposable(() => {

			this._webview.value?.release(this);

		}));

		// Sans ce monitor, l'iframe du webview absorbe le drag : pas de surbrillance ni d'URI explorateur.
		this._webviewDisposables.add(new WebviewWindowDragMonitor(getWindow(this.element), () => this._webview.value));

	}



	private layoutWebview(_dimension?: Dimension): void {

		const webview = this._webview.value;

		if (!this._container || !webview) {

			return;

		}

		const rootContainer = findParentWithClass(this._container, 'monaco-scrollable-element') ?? undefined;
		webview.setAnchorElement(this._container, rootContainer);

	}



	override setVisible(visible: boolean): void {

		super.setVisible(visible);

		this.updateWebviewVisibility();

	}

}


