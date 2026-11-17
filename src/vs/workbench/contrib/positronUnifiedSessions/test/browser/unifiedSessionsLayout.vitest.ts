/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { getConsoleTabListLayout } from '../../../positronConsole/browser/components/consoleTabListLayout.js';

describe('getConsoleTabListLayout', () => {
	test('defaults to one fifth of the view', () => {
		expect(getConsoleTabListLayout(1000, undefined, false, true).tabListWidth).toBe(200);
	});

	test('uses the detailed width the user chose', () => {
		expect(getConsoleTabListLayout(1000, 300, false, true).tabListWidth).toBe(300);
	});

	test('snaps to a compact list when the pointer is released below the threshold', () => {
		expect([true, false].map(resizing => getConsoleTabListLayout(1000, 109, resizing, true)))
			.toMatchObject([{ compact: true, tabListWidth: 109 }, { compact: true, tabListWidth: 32 }]);
	});

	test('restores the preferred width when the available space grows', () => {
		expect([200, 300].map(width => getConsoleTabListLayout(width, 150, false, true)))
			.toMatchObject([{ compact: true, tabListWidth: 32 }, { compact: false, tabListWidth: 150 }]);
	});

	test('leaves room for the pane and separator', () => {
		expect(getConsoleTabListLayout(1000, 990, false, true))
			.toMatchObject({ tabListWidth: 879, paneWidth: 120 });
	});

	test('keeps room for the pane when the entire view is narrower than the compact list', () => {
		expect(getConsoleTabListLayout(28, undefined, false, true))
			.toMatchObject({ tabListWidth: 26, paneWidth: 1 });
	});

	test('uses the entire view for the pane when the list is hidden', () => {
		expect(getConsoleTabListLayout(1000, 150, false, false))
			.toMatchObject({ tabListWidth: 0, paneWidth: 1000 });
	});
});
