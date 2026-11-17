/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { act, screen } from '@testing-library/react';
import { generateUuid } from '../../../../base/common/uuid.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ActionBarActionButton } from '../../browser/components/actionBarActionButton.js';
import { MenuId, MenuItemAction, MenuRegistry } from '../../../actions/common/actions.js';
import { MenuService } from '../../../actions/common/menuService.js';
import { NullCommandService } from '../../../commands/test/common/nullCommandService.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../contextkey/browser/contextKeyService.js';
import { ContextKeyExpr, IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService } from '../../../storage/common/storage.js';
import { setupRTLRenderer } from '../../../../test/vitest/reactTestingLibrary.js';
import { createTestContainer } from '../../../../test/vitest/positronTestContainer.js';

// The badge of a contributed button is driven by context keys that an extension sets, so a real
// ContextKeyService backs both the menu action and the React services the button observes.
describe('ActionBarActionButton badge', () => {
	const contextKeyService = new ContextKeyService(new TestConfigurationService());
	const countKey = contextKeyService.createKey<number | undefined>('test.openTaskCount', undefined);
	const overdueKey = contextKeyService.createKey<boolean>('test.hasOverdueTasks', false);
	const ctx = createTestContainer()
		.withReactServices()
		.stub(IContextKeyService, contextKeyService)
		.build();
	const rtl = setupRTLRenderer(() => ctx.reactServices);

	let disposables: DisposableStore;
	beforeEach(() => {
		disposables = new DisposableStore();
		countKey.reset();
		overdueKey.reset();
	});
	afterEach(() => {
		disposables.dispose();
	});

	const renderButton = () => {
		const menuService = disposables.add(new MenuService(
			NullCommandService,
			new MockKeybindingService(),
			disposables.add(new InMemoryStorageService())
		));
		const menuId = new MenuId(`test/${generateUuid()}`);
		disposables.add(MenuRegistry.appendMenuItem(menuId, {
			command: {
				id: 'test.showTasks',
				title: 'Tasks',
				positronActionBarOptions: {
					controlType: 'button',
					displayTitle: true,
					badge: 'test.openTaskCount',
					badgeWarning: ContextKeyExpr.has('test.hasOverdueTasks'),
				},
			},
		}));
		const menu = disposables.add(menuService.createMenu(menuId, contextKeyService, { eventDebounceDelay: 0 }));
		rtl.render(<ActionBarActionButton action={menu.getActions()[0][1][0] as MenuItemAction} />);
		return screen.getByRole('button');
	};

	it('shows no badge while the count is unset or zero', () => {
		const button = renderButton();
		expect(button).toHaveAccessibleName('Tasks');

		act(() => countKey.set(0));
		expect(button).toHaveAccessibleName('Tasks');
	});

	it('shows the count and follows its changes', () => {
		countKey.set(3);
		const button = renderButton();
		expect(button).toHaveAccessibleName('Tasks (3)');
		expect(screen.getByText('3', { selector: '.action-bar-button-badge' })).not.toHaveClass('warning');

		act(() => countKey.set(2));
		expect(button).toHaveAccessibleName('Tasks (2)');
	});

	it('uses warning colors while the warning condition holds', () => {
		countKey.set(1);
		renderButton();

		act(() => overdueKey.set(true));
		expect(screen.getByText('1', { selector: '.action-bar-button-badge' })).toHaveClass('warning');

		act(() => overdueKey.set(false));
		expect(screen.getByText('1', { selector: '.action-bar-button-badge' })).not.toHaveClass('warning');
	});
});
