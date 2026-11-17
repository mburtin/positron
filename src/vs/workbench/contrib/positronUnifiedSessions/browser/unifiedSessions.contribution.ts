/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { TerminalLocation } from '../../../../platform/terminal/common/terminal.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { Extensions as ViewContainerExtensions, IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainer } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { POSITRON_CONSOLE_VIEW_ID } from '../../../services/positronConsole/browser/interfaces/positronConsoleService.js';
import { ITerminalGroupService, ITerminalService } from '../../terminal/browser/terminal.js';
import { TerminalCommandId, TERMINAL_VIEW_ID } from '../../terminal/common/terminal.js';
import { IUnifiedSessionsState, UNIFIED_SESSIONS_ENABLED_KEY } from '../common/unifiedSessions.js';
import { UnifiedSessionsState } from './unifiedSessionsState.js';
import { UnifiedSessionsViewPane } from './unifiedSessionsViewPane.js';
// Importing this registers the title bar actions for terminals.
import './unifiedSessionsActions.js';
// Importing this registers the terminal group service that shows terminals in the unified tab.
import './unifiedTerminalGroupService.js';

// Register the setting that turns the unified Console and Terminal tab on.
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'console',
	properties: {
		[UNIFIED_SESSIONS_ENABLED_KEY]: {
			type: 'boolean',
			default: true,
			markdownDescription: localize(
				'positron.console.unifiedTabs',
				"Show console sessions and terminals together in the Console tab of the panel, and hide the Terminal tab."
			),
		},
	},
});

registerSingleton(IUnifiedSessionsState, UnifiedSessionsState, InstantiationType.Delayed);

/**
 * UnifiedSessionsContribution class. While the unified tab is turned on, this
 * swaps the Console view for the unified view, takes the Terminal view out of
 * the panel, and keeps the unified view in step with the terminals. Turning the
 * setting off puts everything back.
 */
class UnifiedSessionsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.positronUnifiedSessions';

	/**
	 * What to undo when the unified tab is turned off.
	 */
	private readonly _active = this._register(new DisposableStore());

	private _isActive = false;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IUnifiedSessionsState private readonly _state: IUnifiedSessionsState,
		@IViewsService private readonly _viewsService: IViewsService,
	) {
		super();

		this._update();
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(UNIFIED_SESSIONS_ENABLED_KEY)) {
				this._update();
			}
		}));
	}

	private _update(): void {
		const enabled = this._state.enabled;
		if (enabled === this._isActive) {
			return;
		}
		this._isActive = enabled;
		if (enabled) {
			this._activate();
		} else {
			this._active.clear();
		}
	}

	private _activate(): void {
		const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);
		const containersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);

		// Swap the Console view for the unified view. The unified view keeps the
		// Console view's id, so everything that opens, focuses or targets the
		// Console view lands on it. Its commands were registered with the
		// original view and keep working, so they are not registered again.
		const consoleContainer = containersRegistry.get(POSITRON_CONSOLE_VIEW_ID);
		const consoleView = viewsRegistry.getView(POSITRON_CONSOLE_VIEW_ID);
		if (consoleContainer && consoleView) {
			this._swapView(viewsRegistry, consoleContainer, consoleView, {
				...consoleView,
				ctorDescriptor: new SyncDescriptor(UnifiedSessionsViewPane),
				openCommandActionDescriptor: undefined,
				focusCommand: undefined,
			});
		}

		// Hide the Terminal view; its terminals show in the unified view. It
		// stays registered, with a condition that is never met, so that its
		// container is hidden but still in the panel. The terminals look up
		// where the Terminal view is to decide how they lay out: if it were
		// removed, they would stack splits vertically and use the side bar's
		// background color.
		const terminalContainer = containersRegistry.get(TERMINAL_VIEW_ID);
		const terminalView = viewsRegistry.getView(TERMINAL_VIEW_ID);
		if (terminalContainer && terminalView) {
			this._swapView(viewsRegistry, terminalContainer, terminalView, { ...terminalView, when: ContextKeyExpr.false() });
		}

		// Toggling the terminal (the keybinding and its menu items) shows the
		// terminal in the unified view, or hides it when it is already showing.
		this._active.add(CommandsRegistry.registerCommand(TerminalCommandId.Toggle, async () => {
			if (this._viewsService.isViewVisible(POSITRON_CONSOLE_VIEW_ID) && this._state.selectedTerminalId !== undefined) {
				this._viewsService.closeView(POSITRON_CONSOLE_VIEW_ID);
				return;
			}
			if (this._terminalGroupService.instances.length === 0) {
				await this._terminalService.createTerminal({ location: TerminalLocation.Panel });
			}
			await this._terminalGroupService.showPanel(true);
		}));

		// Show a terminal in the unified view when it becomes the active one,
		// for example when it is created. A terminal that is gone cannot stay selected.
		this._active.add(this._terminalGroupService.onDidChangeActiveInstance(instance => {
			if (instance) {
				this._state.selectTerminal(instance.instanceId);
			}
		}));
		this._active.add(this._terminalService.onDidDisposeInstance(instance => {
			if (instance.instanceId === this._state.selectedTerminalId) {
				this._state.selectTerminal(undefined);
			}
		}));

		// Show the active terminal when something asks for it.
		this._active.add(this._state.onDidRequestReveal(async request => {
			const instance = this._terminalGroupService.activeInstance ?? this._terminalGroupService.instances[0];
			if (!instance) {
				return;
			}
			this._state.selectTerminal(instance.instanceId);
			this._terminalGroupService.updateVisibility();
			if (request.focus) {
				await instance.focusWhenReady(true);
			}
		}));

		// Leave the unified view showing console sessions once the terminals go away.
		this._active.add(toDisposable(() => this._state.selectTerminal(undefined)));
	}

	/**
	 * Replaces a view in the registry, and puts the original back when the
	 * unified tab is turned off.
	 * @param registry The views registry.
	 * @param container The container the view is in.
	 * @param original The view to replace.
	 * @param replacement The view to put in its place, or undefined to just remove it.
	 */
	private _swapView(registry: IViewsRegistry, container: ViewContainer, original: IViewDescriptor, replacement: IViewDescriptor | undefined): void {
		registry.deregisterViews([original], container);
		if (replacement) {
			registry.registerViews([replacement], container);
		}
		this._active.add(toDisposable(() => {
			if (replacement) {
				registry.deregisterViews([replacement], container);
			}
			registry.registerViews([original], container);
		}));
	}
}

registerWorkbenchContribution2(UnifiedSessionsContribution.ID, UnifiedSessionsContribution, WorkbenchPhase.BlockStartup);
