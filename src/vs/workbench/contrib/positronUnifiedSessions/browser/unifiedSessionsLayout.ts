/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The narrowest the tab list can be.
 */
export const MINIMUM_TAB_LIST_WIDTH = 60;

/**
 * The narrowest the session or terminal pane can be.
 */
export const MINIMUM_PANE_WIDTH = 120;

/**
 * Gets the width of the tab list.
 * @param totalWidth The width of the whole view.
 * @param requestedWidth The width the user dragged the tab list to, or undefined
 * to use the default of one fifth of the view.
 * @returns The width to use, kept within what leaves room for the pane.
 */
export function getTabListWidth(totalWidth: number, requestedWidth: number | undefined): number {
	const width = requestedWidth ?? Math.trunc(totalWidth / 5);
	const maximumWidth = Math.max(MINIMUM_TAB_LIST_WIDTH, totalWidth - MINIMUM_PANE_WIDTH);
	return Math.min(Math.max(width, MINIMUM_TAB_LIST_WIDTH), maximumWidth);
}

/**
 * The id of the element that shows the selected terminal. The terminal tabs
 * name it as the panel they control.
 */
export const UNIFIED_TERMINAL_PANEL_ID = 'unified-sessions-terminal-panel';
