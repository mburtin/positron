/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { act, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../base/common/event.js';
import Severity from '../../../../../base/common/severity.js';
import { createTestContainer } from '../../../../../test/vitest/positronTestContainer.js';
import { setupRTLRenderer } from '../../../../../test/vitest/reactTestingLibrary.js';
import { stubInterface } from '../../../../../test/vitest/stubInterface.js';
import { ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';
import { ITerminalStatusList } from '../../../terminal/browser/terminalStatusList.js';
import { ITerminalStatus } from '../../../terminal/common/terminal.js';
import { UnifiedTerminalTab } from '../../browser/unifiedTerminalTab.js';

describe('UnifiedTerminalTab', () => {
	const ctx = createTestContainer().withReactServices().build();
	const rtl = setupRTLRenderer(() => ctx.reactServices);

	// Emitters are created here, not in the tests, so the stub captures the same ones.
	const titleChanged = new Emitter<ITerminalInstance>();
	const iconChanged = new Emitter<{ instance: ITerminalInstance; userInitiated: boolean }>();
	const primaryStatusChanged = new Emitter<ITerminalStatus | undefined>();

	let primaryStatus: ITerminalStatus | undefined;
	let title: string;
	const safeDisposeTerminal = vi.fn().mockResolvedValue(undefined);
	const createTerminal = vi.fn().mockResolvedValue(undefined);
	const onSelect = vi.fn();

	const instance = stubInterface<ITerminalInstance>({
		instanceId: 7,
		get title() { return title; },
		description: undefined,
		icon: Codicon.terminal,
		color: undefined,
		onTitleChanged: titleChanged.event,
		onIconChanged: iconChanged.event,
		statusList: stubInterface<ITerminalStatusList>({
			get primary() { return primaryStatus; },
			onDidChangePrimaryStatus: primaryStatusChanged.event,
		}),
	});
	const terminalService = stubInterface<ITerminalService>({ safeDisposeTerminal, createTerminal });

	beforeEach(() => {
		title = 'zsh';
		primaryStatus = undefined;
	});

	function renderTab(active = false, compact = false) {
		return rtl.render(
			<UnifiedTerminalTab
				active={active}
				compact={compact}
				instance={instance}
				terminalService={terminalService}
				onSelect={onSelect}
			/>
		);
	}

	it('shows the terminal title and icon', () => {
		renderTab();
		expect(screen.getByRole('tab', { name: 'zsh' })).toBeInTheDocument();
		// The icon is a codicon with no text or role, so it is found by its class.
		expect(screen.getByRole('tab')).toContainHTML('codicon-terminal');
	});

	it('marks the active tab as selected', () => {
		renderTab(true);
		expect(screen.getByRole('tab')).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByRole('tab')).toHaveClass('tab-button--active');
	});

	it('follows the terminal title', () => {
		renderTab();
		title = 'build';
		act(() => titleChanged.fire(instance));
		expect(screen.getByRole('tab', { name: 'build' })).toBeInTheDocument();
	});

	it('shows the primary status icon while it has a severity', () => {
		renderTab();
		primaryStatus = { id: 'bell', severity: Severity.Warning, icon: Codicon.bell };
		act(() => primaryStatusChanged.fire(primaryStatus));
		expect(screen.getByRole('tab')).toContainHTML('codicon-bell');
	});

	it('keeps only the terminal profile icon and a status dot in compact mode', () => {
		primaryStatus = { id: 'bell', severity: Severity.Warning, icon: Codicon.bell, tooltip: 'Bell' };
		renderTab(false, true);

		const tab = screen.getByRole('tab', { name: 'zsh', description: 'Bell' });
		expect(tab).toContainHTML('codicon-terminal');
		expect(tab).toContainHTML('tab-status-dot');
		expect(screen.queryByText('zsh')).not.toBeInTheDocument();
		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});

	it('selects the terminal when clicked', async () => {
		const user = userEvent.setup();
		renderTab();
		await user.click(screen.getByRole('tab'));
		expect(onSelect).toHaveBeenCalledWith(instance);
	});

	it('closes the terminal from the close button without selecting it', async () => {
		const user = userEvent.setup();
		renderTab();
		await user.click(screen.getByRole('button', { name: 'Close Terminal' }));
		expect(safeDisposeTerminal).toHaveBeenCalledWith(instance);
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('closes the terminal on a middle click', () => {
		renderTab();
		// user-event has no auxiliary button click, so the event is fired directly.
		const tab = screen.getByRole('tab');
		act(() => {
			tab.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));
		});
		expect(safeDisposeTerminal).toHaveBeenCalledWith(instance);
	});

	it('splits the terminal from the split button without selecting it', async () => {
		const user = userEvent.setup();
		renderTab();
		await user.click(screen.getByRole('button', { name: 'Split Terminal' }));
		expect(createTerminal).toHaveBeenCalledWith({ location: { parentTerminal: instance } });
		expect(onSelect).not.toHaveBeenCalled();
	});
});
