/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import { KeyboardEvent, MouseEvent, useEffect, useState } from 'react';

// Other dependencies.
import * as DOM from '../../../../base/browser/dom.js';
import { localize } from '../../../../nls.js';
import { usePositronReactServicesContext } from '../../../../base/browser/positronReactRendererContext.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import Severity from '../../../../base/common/severity.js';
import { IMenuService, MenuId } from '../../../../platform/actions/common/actions.js';
import { isMacintosh } from '../../../../base/common/platform.js';
import { ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { UNIFIED_TERMINAL_PANEL_ID } from './unifiedSessionsLayout.js';
import { openContextMenu } from '../../terminal/browser/terminalContextMenu.js';
import { getColorClass, getIconId } from '../../terminal/browser/terminalIcon.js';
import { TerminalCommandId } from '../../terminal/common/terminal.js';

/**
 * UnifiedTerminalTabProps interface.
 */
interface UnifiedTerminalTabProps {
	readonly instance: ITerminalInstance;
	readonly active: boolean;
	readonly terminalService: ITerminalService;
	readonly onSelect: (instance: ITerminalInstance) => void;
}

/**
 * What a terminal's tab shows, which changes while the terminal runs.
 */
interface TabAppearance {
	readonly title: string;
	readonly description: string | undefined;
	readonly iconId: string;
	readonly colorClass: string | undefined;
	readonly statusTooltip: string | undefined;
}

/**
 * UnifiedTerminalTab component. A terminal's entry in the unified tab list. It
 * looks like a console session's tab so the two read as one list, and it has
 * the terminal's own tab menu, status icon and color.
 * @param props The component properties.
 * @returns The rendered component.
 */
export const UnifiedTerminalTab = (props: UnifiedTerminalTabProps) => {
	const { instance, active, terminalService, onSelect } = props;
	const services = usePositronReactServicesContext();

	const getAppearance = (): TabAppearance => {
		const status = instance.statusList.primary;
		const showStatus = status !== undefined && status.severity > Severity.Ignore;
		return {
			title: instance.title,
			description: instance.description,
			iconId: (showStatus && status.icon?.id) || services.instantiationService.invokeFunction(getIconId, instance),
			colorClass: getColorClass(instance),
			statusTooltip: showStatus ? status.tooltip : undefined,
		};
	};
	const [appearance, setAppearance] = useState(getAppearance);

	// Follow the terminal's title, icon, color and status.
	useEffect(() => {
		const update = () => setAppearance(getAppearance());
		update();
		const disposables = new DisposableStore();
		disposables.add(instance.onTitleChanged(update));
		disposables.add(instance.onIconChanged(update));
		disposables.add(instance.statusList.onDidChangePrimaryStatus(update));
		return () => disposables.dispose();
		// eslint-disable-next-line react-hooks/exhaustive-deps -- getAppearance only reads the instance and services.
	}, [instance, services]);

	const label = appearance.description ? `${appearance.title} - ${appearance.description}` : appearance.title;

	const handleClick = (e: MouseEvent<HTMLDivElement>) => {
		e.stopPropagation();
		onSelect(instance);
	};

	// Close the terminal on a middle click, as the Terminal view does.
	const handleAuxClick = (e: MouseEvent<HTMLDivElement>) => {
		if (e.button === 1) {
			e.preventDefault();
			e.stopPropagation();
			terminalService.safeDisposeTerminal(instance);
		}
	};

	// Show the terminal tab menu, the one the Terminal view shows for its tabs.
	const handleContextMenu = (e: MouseEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		onSelect(instance);
		const menu = services.instantiationService.invokeFunction(accessor =>
			accessor.get(IMenuService).createMenu(MenuId.TerminalTabContext, services.contextKeyService));
		openContextMenu(DOM.getWindow(e.currentTarget), e.nativeEvent, instance, menu, services.contextMenuService);
		menu.dispose();
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		// Rename with F2, or Enter on macOS, as in the Terminal view.
		if (e.key === 'F2' || (isMacintosh && e.key === 'Enter')) {
			e.preventDefault();
			e.stopPropagation();
			onSelect(instance);
			services.commandService.executeCommand(TerminalCommandId.Rename);
		} else if (e.key === 'Delete' || (isMacintosh && e.key === 'Backspace')) {
			e.preventDefault();
			e.stopPropagation();
			terminalService.safeDisposeTerminal(instance);
		}
	};

	// Split the terminal, as the split button of the Terminal view does.
	const handleSplit = (e: MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();
		terminalService.createTerminal({ location: { parentTerminal: instance } });
	};

	const handleClose = (e: MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		e.stopPropagation();
		terminalService.safeDisposeTerminal(instance);
	};

	const handleCloseKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			terminalService.safeDisposeTerminal(instance);
		}
	};

	// Render.
	return (
		<div
			aria-controls={active ? UNIFIED_TERMINAL_PANEL_ID : undefined}
			aria-label={label}
			aria-selected={active}
			className={`tab-button unified-terminal-tab${active ? ' tab-button--active' : ''}`}
			data-testid={`terminal-tab-${instance.instanceId}`}
			role='tab'
			tabIndex={active ? 0 : -1}
			title={appearance.statusTooltip ? `${label}\n${appearance.statusTooltip}` : label}
			onAuxClick={handleAuxClick}
			onClick={handleClick}
			onContextMenu={handleContextMenu}
			onKeyDown={handleKeyDown}
		>
			<div className={`tab-header${appearance.colorClass ? ` ${appearance.colorClass}` : ''}`}>
				<span className={`codicon codicon-${appearance.iconId}`} />
				<p className='session-name'>{appearance.title}</p>
				<button
					aria-label={localize('positron.unifiedSessions.splitTerminal', "Split Terminal")}
					className='split-button'
					onClick={handleSplit}
					onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
				>
					<span className='codicon codicon-split-horizontal' />
				</button>
				<button
					aria-label={localize('positron.unifiedSessions.closeTerminal', "Close Terminal")}
					className='delete-button'
					onClick={handleClose}
					onKeyDown={handleCloseKeyDown}
					onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
				>
					<span className='codicon codicon-trash' />
				</button>
			</div>
		</div>
	);
};
