/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { screen } from '@testing-library/react';
import { IAction } from '../../../../../../base/common/actions.js';
import { ModifierKeyEmitter } from '../../../../../../base/browser/dom.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { MenuId, MenuItemAction, SubmenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { PositronActionBarOptions } from '../../../../../../platform/action/common/action.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { createTestContainer } from '../../../../../../test/vitest/positronTestContainer.js';
import { setupRTLRenderer } from '../../../../../../test/vitest/reactTestingLibrary.js';
import { hasTopActionBarActions, TopActionBarContributedActions } from '../../components/topActionBarContributedActions.js';

describe('TopActionBarContributedActions', () => {
	const ctx = createTestContainer().withReactServices().build();
	const rtl = setupRTLRenderer(() => ctx.reactServices);

	// ActionBarActionButton lazily creates the process-global ModifierKeyEmitter singleton on first
	// render; dispose it so the leak tracker stays clean.
	afterEach(() => ModifierKeyEmitter.disposeInstance());

	/**
	 * Creates a menu item action with an icon.
	 */
	const menuItem = (id: string, title: string, positronActionBarOptions?: PositronActionBarOptions) =>
		ctx.instantiationService.createInstance(
			MenuItemAction,
			{ id, title, icon: ThemeIcon.fromId('circle-filled'), positronActionBarOptions },
			undefined,
			undefined,
			undefined,
			undefined
		);

	/**
	 * Creates a submenu item action.
	 */
	const submenuItem = (title: string, actions: IAction[]) =>
		new SubmenuItemAction(
			{ submenu: MenuId.PositronTopActionBarCenter, title, icon: ThemeIcon.fromId('ellipsis') },
			undefined,
			actions
		);

	/**
	 * Renders the component.
	 */
	const renderActions = (actionGroups: [string, (MenuItemAction | SubmenuItemAction)[]][], showLeadingSeparator?: boolean) =>
		rtl.render(
			<TopActionBarContributedActions
				actionGroups={actionGroups}
				contextKeyService={ctx.get(IContextKeyService)}
				showLeadingSeparator={showLeadingSeparator}
			/>
		);

	it('renders nothing when there are no actions', () => {
		const { container } = renderActions([]);

		expect(container).toBeEmptyDOMElement();
	});

	it('renders a button for each action and a separator between groups', () => {
		const { container } = renderActions([
			['navigation', [menuItem('test.first', 'First')]],
			['1_main', [menuItem('test.second', 'Second')]],
		]);

		expect(screen.getByRole('button', { name: 'First' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Second' })).toBeInTheDocument();
		// Separators are decorative (aria-hidden) and carry no role; count them structurally.
		// eslint-disable-next-line no-restricted-syntax -- no semantic query exists for a decorative separator
		expect(container.querySelectorAll('.action-bar-separator')).toHaveLength(1);
	});

	it('renders a leading separator when asked and actions are present', () => {
		const { container } = renderActions([['1_main', [menuItem('test.first', 'First')]]], true);

		// eslint-disable-next-line no-restricted-syntax -- no semantic query exists for a decorative separator
		expect(container.querySelectorAll('.action-bar-separator')).toHaveLength(1);
	});

	it('does not render a leading separator when there are no actions', () => {
		const { container } = renderActions([], true);

		expect(container).toBeEmptyDOMElement();
	});

	it('renders a submenu item action as a drop-down button', () => {
		renderActions([['1_main', [submenuItem('More Actions', [menuItem('test.first', 'First')])]]]);

		expect(screen.getByRole('button', { name: 'More Actions' })).toBeInTheDocument();
	});

	it('renders a submenu label when the submenu declares no icon', () => {
		const action = new SubmenuItemAction(
			{ submenu: MenuId.PositronTopActionBarCenter, title: 'No Icon Menu' },
			undefined,
			[menuItem('test.first', 'First')]
		);
		renderActions([['1_main', [action]]]);

		expect(screen.getByRole('button', { name: 'No Icon Menu' })).toHaveTextContent('No Icon Menu');
	});

	it('honors the displayTitle action bar option', () => {
		renderActions([['1_main', [menuItem('test.first', 'First', { controlType: 'button', displayTitle: true })]]]);

		expect(screen.getByRole('button', { name: 'First' })).toHaveTextContent('First');
	});

	describe('hasTopActionBarActions', () => {
		it('is false for empty groups', () => {
			expect(hasTopActionBarActions([])).toBe(false);
			expect(hasTopActionBarActions([['1_main', []]])).toBe(false);
		});

		it('is true when a group has an action', () => {
			expect(hasTopActionBarActions([['1_main', [menuItem('test.first', 'First')]]])).toBe(true);
		});
	});
});
