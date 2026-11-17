/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * The setting that turns the unified Console and Terminal tab on.
 */
export const UNIFIED_SESSIONS_ENABLED_KEY = 'console.unifiedTabs';

/**
 * Set in the unified view while it shows a terminal rather than a console session.
 */
export const UnifiedTerminalSelectedContext = new RawContextKey<boolean>('positronUnifiedTerminalSelected', false);

/**
 * A request to show the active terminal.
 */
export interface IUnifiedSessionsRevealRequest {
	/**
	 * Whether the terminal should also take focus.
	 */
	readonly focus: boolean;
}

export const IUnifiedSessionsState = createDecorator<IUnifiedSessionsState>('unifiedSessionsState');

/**
 * What the unified Console and Terminal tab is showing. It holds no
 * dependencies, so that the terminal group service (which the tab depends on
 * to find terminals) can depend on it too.
 */
export interface IUnifiedSessionsState {
	readonly _serviceBrand: undefined;

	/**
	 * Whether the unified tab is turned on.
	 */
	readonly enabled: boolean;

	/**
	 * The instance id of the terminal the tab is showing, or undefined while
	 * it shows a console session.
	 */
	readonly selectedTerminalId: number | undefined;

	/**
	 * Fires when the selected terminal changes.
	 */
	readonly onDidChangeSelection: Event<number | undefined>;

	/**
	 * Fires when something asks to show the active terminal.
	 */
	readonly onDidRequestReveal: Event<IUnifiedSessionsRevealRequest>;

	/**
	 * The keys of the entries of the tab list, in the order the user put them
	 * in by dragging. Entries that are not in it yet are listed last.
	 */
	readonly order: readonly string[];

	/**
	 * Fires when the order changes.
	 */
	readonly onDidChangeOrder: Event<void>;

	/**
	 * Shows a terminal in the tab, or shows the console sessions when undefined.
	 */
	selectTerminal(instanceId: number | undefined): void;

	/**
	 * Sets the order of the entries of the tab list.
	 */
	setOrder(order: readonly string[]): void;

	/**
	 * Asks for the active terminal to be shown in the tab.
	 */
	requestReveal(focus: boolean): void;
}
