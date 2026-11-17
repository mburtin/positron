/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import './unifiedSessions.css';

// Other dependencies.
import * as DOM from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { Action, IAction, Separator } from '../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { MutableDisposable } from '../../../../base/common/lifecycle.js';
import { IActionViewItem } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IDropdownMenuActionViewItemOptions } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IReactComponentContainer, ISize, PositronReactRenderer } from '../../../../base/browser/positronReactRenderer.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { DropdownWithPrimaryActionViewItem } from '../../../../platform/actions/browser/dropdownWithPrimaryActionViewItem.js';
import { MenuItemAction } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { PositronViewPane } from '../../../browser/positronViewPane/positronViewPane.js';
import { IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { PositronConsoleFocused, PositronConsoleInstancesExistContext } from '../../../common/contextkeys.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { LanguageRuntimeSessionMode } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { IPositronConsoleService } from '../../../services/positronConsole/browser/interfaces/positronConsoleService.js';
import { IRuntimeSessionService, RuntimeStartMode, SessionStartReasonId } from '../../../services/runtimeSession/common/runtimeSessionService.js';
import { LANGUAGE_RUNTIME_DUPLICATE_ACTIVE_CONSOLE_SESSION_ID, LANGUAGE_RUNTIME_START_NEW_AGENT_SESSION_ID, LANGUAGE_RUNTIME_START_NEW_CONSOLE_SESSION_ID } from '../../languageRuntime/browser/languageRuntimeActions.js';
import { AGENT_SESSIONS_ENABLED_KEY, AI_ENABLED_KEY } from '../../positronAssistant/common/positronAIConfiguration.js';
import { buildRuntimesDropdown } from '../../positronConsole/common/sessionDropdownUtils.js';
import { PositronConsoleContextProvider } from '../../positronConsole/browser/positronConsoleContext.js';
import { ITerminalGroupService, ITerminalService } from '../../terminal/browser/terminal.js';
import { TerminalCommandId } from '../../terminal/common/terminal.js';
import { IUnifiedSessionsState, UnifiedTerminalSelectedContext } from '../common/unifiedSessions.js';
import { UnifiedSessionsCore } from './unifiedSessionsCore.js';
import { UnifiedTerminalIconStyle } from './unifiedTerminalIconStyle.js';

/**
 * UnifiedSessionsViewPane class. Shows console sessions and terminals in a
 * single tab list, with the selected one filling the rest of the view. It
 * takes the place of the Console view while the unified tab is turned on, so
 * it also does what the Console view does: it keeps the console context keys,
 * and it offers the same menu for starting sessions.
 *
 * It reuses the console's React components and the terminal's services, and
 * does not change either of them.
 */
export class UnifiedSessionsViewPane extends PositronViewPane implements IReactComponentContainer {
	//#region Private Properties

	private readonly _onSizeChangedEmitter = this._register(new Emitter<ISize>());
	private readonly _onVisibilityChangedEmitter = this._register(new Emitter<boolean>());
	private readonly _onSaveScrollPositionEmitter = this._register(new Emitter<void>());
	private readonly _onRestoreScrollPositionEmitter = this._register(new Emitter<void>());
	private readonly _onFocusedEmitter = this._register(new Emitter<void>());

	private _width = 0;
	private _height = 0;
	private _container!: HTMLElement;

	private readonly _consoleFocusedContextKey: IContextKey<boolean>;
	private readonly _consoleInstancesExistContextKey: IContextKey<boolean>;
	private readonly _terminalSelectedContextKey: IContextKey<boolean>;
	private readonly _sessionDropdown = this._register(new MutableDisposable<DropdownWithPrimaryActionViewItem>());

	//#endregion Private Properties

	//#region IReactComponentContainer

	get width() {
		return this._width;
	}

	get height() {
		return this._height;
	}

	get containerVisible() {
		return this.isBodyVisible();
	}

	takeFocus(): void {
		this.focus();
	}

	focusChanged(focused: boolean): void {
		// Console keybindings only apply while a console session is showing.
		this._consoleFocusedContextKey.set(focused && this._unifiedState.selectedTerminalId === undefined);

		if (focused && this._unifiedState.selectedTerminalId === undefined) {
			// Keep the foreground session in step with the active console, as
			// the Console view does when focus lands in its body. Notebook
			// consoles skip this: they gain focus as a side effect of the
			// active tab switching, not from a deliberate user gesture.
			if (!this._positronConsoleService.isDeletingNotebookConsole) {
				const activeInstance = this._positronConsoleService.activePositronConsoleInstance;
				if (activeInstance?.attachedRuntimeSession) {
					this._runtimeSessionService.foregroundSession = activeInstance.attachedRuntimeSession;
				}
			}
			this._onFocusedEmitter.fire();
		}
	}

	readonly onSizeChanged: Event<ISize> = this._onSizeChangedEmitter.event;
	readonly onVisibilityChanged: Event<boolean> = this._onVisibilityChangedEmitter.event;
	readonly onSaveScrollPosition: Event<void> = this._onSaveScrollPositionEmitter.event;
	readonly onRestoreScrollPosition: Event<void> = this._onRestoreScrollPositionEmitter.event;
	readonly onFocused: Event<void> = this._onFocusedEmitter.event;

	//#endregion IReactComponentContainer

	//#region Constructor

	constructor(
		options: IViewPaneOptions,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IHoverService hoverService: IHoverService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IOpenerService openerService: IOpenerService,
		@IPositronConsoleService private readonly _positronConsoleService: IPositronConsoleService,
		@IRuntimeSessionService private readonly _runtimeSessionService: IRuntimeSessionService,
		@IThemeService themeService: IThemeService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
		@IUnifiedSessionsState private readonly _unifiedState: IUnifiedSessionsState,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
	) {
		super(
			options,
			keybindingService,
			contextMenuService,
			configurationService,
			contextKeyService,
			viewDescriptorService,
			instantiationService,
			openerService,
			themeService,
			hoverService
		);

		this._consoleFocusedContextKey = PositronConsoleFocused.bindTo(contextKeyService);
		this._consoleInstancesExistContextKey = PositronConsoleInstancesExistContext.bindTo(contextKeyService);
		this._terminalSelectedContextKey = UnifiedTerminalSelectedContext.bindTo(contextKeyService);
		this._terminalSelectedContextKey.set(this._unifiedState.selectedTerminalId !== undefined);

		// Relay body visibility for the IReactComponentContainer implementation.
		this._register(this.onDidChangeBodyVisibility(visible => {
			this._onVisibilityChangedEmitter.fire(visible);
			this._terminalGroupService.updateVisibility();
		}));

		// Keep the session menu and the console context key up to date.
		this._register(this._runtimeSessionService.onDidStartRuntime(() => this.updateActions()));
		this._register(this._runtimeSessionService.onDidChangeForegroundSession(() => this.updateActions()));
		this._register(this._runtimeSessionService.onDidDeleteRuntimeSession(() => this.updateActions()));
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AI_ENABLED_KEY) || e.affectsConfiguration(AGENT_SESSIONS_ENABLED_KEY)) {
				this.updateActions();
			}
		}));
		this._register(this._positronConsoleService.onDidStartPositronConsoleInstance(() => this._updateConsoleInstancesExist()));
		this._register(this._positronConsoleService.onDidDeletePositronConsoleInstance(() => this._updateConsoleInstancesExist()));

		// The visible terminals follow the selection.
		this._register(this._unifiedState.onDidChangeSelection(selectedTerminalId => {
			this._terminalSelectedContextKey.set(selectedTerminalId !== undefined);
			this._terminalGroupService.updateVisibility();
		}));
	}

	//#endregion Constructor

	//#region Overrides

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._container = DOM.$('.positron-unified-sessions-container');
		container.appendChild(this._container);

		// Style the terminal tabs with their custom colors and icons.
		this._register(this.instantiationService.createInstance(UnifiedTerminalIconStyle, this._container));

		const renderer = this._register(new PositronReactRenderer(this._container));
		renderer.render(
			<PositronConsoleContextProvider>
				<UnifiedSessionsCore
					reactComponentContainer={this}
					terminalGroupService={this._terminalGroupService}
					terminalService={this._terminalService}
					unifiedState={this._unifiedState}
				/>
			</PositronConsoleContextProvider>
		);

		const focusTracker = this._register(DOM.trackFocus(this.element));
		this._register(focusTracker.onDidFocus(() => this.focusChanged(true)));
		this._register(focusTracker.onDidBlur(() => this.focusChanged(false)));

		this._updateConsoleInstancesExist();
	}

	/**
	 * Drives focus to the console input, or to the terminal when one is selected.
	 */
	override focusElement(): void {
		if (this._unifiedState.selectedTerminalId !== undefined) {
			this._terminalGroupService.activeInstance?.focus(true);
			return;
		}
		this._positronConsoleService.activePositronConsoleInstance?.focusInput();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);

		this._container.style.width = `${width}px`;
		this._container.style.height = `${height}px`;

		this._width = width;
		this._height = height;

		this._onSizeChangedEmitter.fire({ width, height });
	}

	override createActionViewItem(action: IAction, options?: IDropdownMenuActionViewItemOptions): IActionViewItem | undefined {
		// The Console view's "start session" button becomes a split button with
		// a menu of runtimes, once there is a session to base the menu on.
		if (action.id === LANGUAGE_RUNTIME_DUPLICATE_ACTIVE_CONSOLE_SESSION_ID &&
			this._positronConsoleService.positronConsoleInstances.length > 0 &&
			action instanceof MenuItemAction) {
			const dropdownAction = new Action('console.session.quickLaunch', localize('console.session.quickLaunch', 'Quick Launch Session...'), 'codicon-chevron-down', true);
			this._register(dropdownAction);

			this._sessionDropdown.value = new DropdownWithPrimaryActionViewItem(
				action,
				dropdownAction,
				[],
				'',
				{},
				this.contextMenuService, this.keybindingService, this._notificationService, this.contextKeyService, this.themeService, this._accessibilityService);
			this._updateSessionDropdown(dropdownAction);

			return this._sessionDropdown.value;
		}
		return super.createActionViewItem(action, options);
	}

	//#endregion Overrides

	//#region Private Methods

	private _updateConsoleInstancesExist(): void {
		this._consoleInstancesExistContextKey.set(this._positronConsoleService.positronConsoleInstances.length > 0);
	}

	/**
	 * Fills the session menu: the runtimes that can be started, then a way to
	 * start another session, then a new terminal.
	 */
	private _updateSessionDropdown(dropdownAction: Action): void {
		const currentRuntime = this._runtimeSessionService.foregroundSession?.runtimeMetadata;
		const activeRuntimes = buildRuntimesDropdown(currentRuntime, this._runtimeSessionService.activeSessions);

		const actions: IAction[] = activeRuntimes.map(runtime => new Action(
			`console.startSession.${runtime.runtimeId}`,
			runtime.runtimeName,
			undefined,
			true,
			() => {
				this._runtimeSessionService.startNewRuntimeSession(
					runtime.runtimeId,
					runtime.runtimeName,
					LanguageRuntimeSessionMode.Console,
					undefined,
					{ id: SessionStartReasonId.UserSelectedRuntime },
					RuntimeStartMode.Starting,
					true,
					{ userSelected: true }
				);
			})
		);

		if (actions.length === 0) {
			actions.push(new Action('console.startSession.none', localize('console.startSession.none', 'No Sessions'), undefined, false));
		}

		actions.push(new Action(
			'console.startSession.other',
			localize('console.startSession.other', 'Start Another...'),
			undefined,
			true,
			() => this._commandService.executeCommand(LANGUAGE_RUNTIME_START_NEW_CONSOLE_SESSION_ID)
		));

		if (this.configurationService.getValue<boolean>(AI_ENABLED_KEY) === true &&
			this.configurationService.getValue<boolean>(AGENT_SESSIONS_ENABLED_KEY) === true) {
			// Set apart from the user's own sessions: this starts one for an agent.
			actions.push(new Separator());
			actions.push(new Action(
				'console.startSession.agent',
				localize('console.startSession.agent', 'Start Agent Console Session...'),
				undefined,
				true,
				() => this._commandService.executeCommand(LANGUAGE_RUNTIME_START_NEW_AGENT_SESSION_ID)
			));
		}

		actions.push(new Separator());
		actions.push(new Action(
			'unifiedSessions.newTerminal',
			localize('positron.unifiedSessions.newTerminal', "New Terminal"),
			undefined,
			true,
			() => this._commandService.executeCommand(TerminalCommandId.New)
		));

		// Separators are plain IActions with nothing to dispose.
		actions.forEach(action => {
			if (action instanceof Action) {
				this._register(action);
			}
		});

		this._sessionDropdown.value?.update(dropdownAction, actions, 'codicon-chevron-down');
	}

	//#endregion Private Methods
}
