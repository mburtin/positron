/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { useState } from 'react';
import { VerticalSplitterResizeParams } from '../../../../../base/browser/ui/positronComponents/splitters/verticalSplitter.js';

const SPLITTER_WIDTH = 1;
// Match the compact tab's 24px header and 4px padding on each side.
const COMPACT_TAB_LIST_WIDTH = 32;
const MINIMUM_DETAILED_TAB_LIST_WIDTH = 110;
const MINIMUM_PANE_WIDTH = 120;

/**
 * Resolves the requested width and snaps the compact list after the drag ends.
 * Keep the requested width so the detailed list can be restored when the
 * workbench grows again.
 */
export function getConsoleTabListLayout(totalWidth: number, preferredWidth: number | undefined, resizing: boolean, visible: boolean) {
	const showList = visible && totalWidth > SPLITTER_WIDTH + 1;
	const availableWidth = Math.max(0, totalWidth - (showList ? SPLITTER_WIDTH : 0));
	const minimumWidth = Math.min(COMPACT_TAB_LIST_WIDTH, Math.max(0, availableWidth - 1));
	const maximumWidth = Math.max(minimumWidth, availableWidth - MINIMUM_PANE_WIDTH);
	const requestedWidth = Math.min(Math.max(preferredWidth ?? Math.trunc(totalWidth / 5), minimumWidth), maximumWidth);
	const compact = requestedWidth < MINIMUM_DETAILED_TAB_LIST_WIDTH;
	const tabListWidth = showList ? (compact && !resizing ? minimumWidth : requestedWidth) : 0;
	return { availableWidth, minimumWidth, compact, tabListWidth, paneWidth: availableWidth - tabListWidth };
}

/**
 * Supplies the shared layout and sash handlers for the console and unified session lists.
 */
export function useConsoleTabListLayout(width: number, visible: boolean) {
	const [preferredWidth, setPreferredWidth] = useState<number>();
	const [resizing, setResizing] = useState(false);
	const { availableWidth, minimumWidth, compact, tabListWidth, paneWidth } =
		getConsoleTabListLayout(width, preferredWidth, resizing, visible);

	const splitterProps = {
		onBeginResize: (): VerticalSplitterResizeParams => ({
			minimumWidth: Math.min(MINIMUM_PANE_WIDTH, paneWidth),
			maximumWidth: availableWidth - minimumWidth,
			startingWidth: paneWidth,
		}),
		onResize: (newPaneWidth: number) => {
			setResizing(true);
			setPreferredWidth(availableWidth - newPaneWidth);
		},
		onEndResize: () => setResizing(false),
	};
	return { compact, tabListWidth, paneWidth, splitterProps };
}
