/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { test, expect, tags } from '../_test.setup';

test.use({
	suiteId: __filename
});

test.describe('Console: Unified Console and Terminal tabs', {
	tag: [tags.CONSOLE, tags.WIN]
}, () => {

	test('Console sessions and terminals share one tab list', {
		tag: [tags.PYTHON]
	}, async function ({ app, page, python }) {
		const terminalTab = page.getByTestId(/^terminal-tab-/);
		const terminalPanel = page.getByRole('tabpanel', { name: 'Terminal' });

		await test.step('The Terminal tab is replaced by the Console tab', async () => {
			await expect(page.getByRole('tab', { name: 'Console' })).toBeVisible();
			await expect(page.getByRole('tab', { name: 'Terminal', exact: true })).toHaveCount(0);
			await expect(page.getByTestId(/^console-tab-/)).toHaveCount(1);
		});

		await test.step('A new terminal is listed beside the console session and shown', async () => {
			await app.workbench.quickaccess.runCommand('workbench.action.terminal.new');
			await expect(terminalTab).toHaveCount(1);
			await expect(terminalTab).toHaveAttribute('aria-selected', 'true');
			await expect(terminalPanel).toBeVisible();
			// The terminal draws into a canvas, so there is no role or text to find it by.
			await expect(terminalPanel.locator('.xterm')).toBeVisible();
		});

		await test.step('Selecting the console session shows the console again', async () => {
			await page.getByTestId(/^console-tab-/).click();
			await expect(terminalPanel).toBeHidden();
			await expect(terminalTab).toHaveAttribute('aria-selected', 'false');
		});

		await test.step('Selecting the terminal shows it again', async () => {
			await terminalTab.click();
			await expect(terminalPanel).toBeVisible();
		});

		await test.step('Closing the terminal removes its tab and shows the console', async () => {
			await terminalTab.hover();
			await terminalTab.getByRole('button', { name: 'Close Terminal' }).click();
			await expect(terminalTab).toHaveCount(0);
			await expect(terminalPanel).toBeHidden();
		});
	});
});
