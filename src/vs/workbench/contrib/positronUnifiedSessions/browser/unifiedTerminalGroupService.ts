/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// The terminal contribution registers the terminal group service. It is
// imported here so that it is evaluated first, which makes the registration at
// the bottom of this file the one that wins, wherever this file is imported from.
import '../../terminal/browser/terminal.contribution.js';

import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { POSITRON_CONSOLE_VIEW_ID } from '../../../services/positronConsole/browser/interfaces/positronConsoleService.js';
import { ITerminalGroupService } from '../../terminal/browser/terminal.js';
import { TerminalGroupService } from '../../terminal/browser/terminalGroupService.js';
import { IUnifiedSessionsState } from '../common/unifiedSessions.js';

/**
 * UnifiedTerminalGroupService class. The terminal group service, except that
 * while the unified tab is turned on it shows terminals in that tab instead of
 * in the Terminal view. With the tab turned off it behaves exactly like the
 * service it extends.
 */
export class UnifiedTerminalGroupService extends TerminalGroupService {
	/**
	 * The element the terminals were last attached to.
	 */
	private _unifiedContainer: HTMLElement | undefined;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IViewsService private readonly _unifiedViewsService: IViewsService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IUnifiedSessionsState private readonly _unifiedState: IUnifiedSessionsState,
	) {
		super(contextKeyService, instantiationService, _unifiedViewsService, viewDescriptorService, quickInputService);
	}

	override async showPanel(focus?: boolean): Promise<void> {
		if (!this._unifiedState.enabled) {
			return super.showPanel(focus);
		}
		await this._unifiedViewsService.openView(POSITRON_CONSOLE_VIEW_ID, false);
		this._unifiedState.requestReveal(focus === true);
	}

	override hidePanel(): void {
		if (!this._unifiedState.enabled) {
			return super.hidePanel();
		}
		if (this._unifiedState.selectedTerminalId !== undefined) {
			this._unifiedViewsService.closeView(POSITRON_CONSOLE_VIEW_ID);
		}
	}

	override async focusTabs(): Promise<void> {
		if (!this._unifiedState.enabled) {
			return super.focusTabs();
		}
	}

	override async focusHover(): Promise<void> {
		if (!this._unifiedState.enabled) {
			return super.focusHover();
		}
	}

	override setContainer(container: HTMLElement): void {
		this._unifiedContainer = container;
		super.setContainer(container);
	}

	override updateVisibility(): void {
		if (!this._unifiedState.enabled) {
			return super.updateVisibility();
		}
		// A terminal opens as soon as it is visible, and it cannot open until
		// the element it lives in is in the document. So nothing is visible
		// until the unified view has attached the terminals.
		const visible = this._unifiedViewsService.isViewVisible(POSITRON_CONSOLE_VIEW_ID) &&
			this._unifiedState.selectedTerminalId !== undefined &&
			this._unifiedContainer?.isConnected === true;
		this.groups.forEach((group, index) => group.setVisible(visible && index === this.activeGroupIndex));
	}
}

registerSingleton(ITerminalGroupService, UnifiedTerminalGroupService, InstantiationType.Delayed);
