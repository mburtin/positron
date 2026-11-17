/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { getTabListWidth, MINIMUM_PANE_WIDTH, MINIMUM_TAB_LIST_WIDTH } from '../../browser/unifiedSessionsLayout.js';

describe('getTabListWidth', () => {
	test('defaults to one fifth of the view', () => {
		expect(getTabListWidth(1000, undefined)).toBe(200);
	});

	test('uses the width the user chose', () => {
		expect(getTabListWidth(1000, 300)).toBe(300);
	});

	test('never goes below the minimum', () => {
		expect(getTabListWidth(1000, 10)).toBe(MINIMUM_TAB_LIST_WIDTH);
		expect(getTabListWidth(100, undefined)).toBe(MINIMUM_TAB_LIST_WIDTH);
	});

	test('leaves room for the pane', () => {
		expect(getTabListWidth(1000, 990)).toBe(1000 - MINIMUM_PANE_WIDTH);
	});

	test('keeps the minimum when the view is too narrow for both', () => {
		expect(getTabListWidth(150, 100)).toBe(MINIMUM_TAB_LIST_WIDTH);
	});
});
