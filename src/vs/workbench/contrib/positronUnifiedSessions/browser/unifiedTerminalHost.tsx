/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import { useEffect, useRef } from 'react';

// Other dependencies.
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ITerminalGroupService, ITerminalService } from '../../terminal/browser/terminal.js';
import { UNIFIED_TERMINAL_PANEL_ID } from './unifiedSessionsLayout.js';

/**
 * UnifiedTerminalHostProps interface.
 */
interface UnifiedTerminalHostProps {
	readonly terminalService: ITerminalService;
	readonly terminalGroupService: ITerminalGroupService;
	readonly visible: boolean;
	readonly width: number;
	readonly height: number;
}

/**
 * UnifiedTerminalHost component. Gives the terminal groups an element to live
 * in, and lays them out to fill it. It covers the console pane while a
 * terminal is selected and is hidden otherwise.
 * @param props The component properties.
 * @returns The rendered component.
 */
export const UnifiedTerminalHost = (props: UnifiedTerminalHostProps) => {
	const hostRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const { terminalService, terminalGroupService, visible, width, height } = props;

	// The latest size, for laying out groups that become visible later.
	const sizeRef = useRef({ width, height });
	sizeRef.current = { width, height };

	// Attach the terminals to the host whenever it is shown. Another view
	// (for example, the Terminal view) may have taken them since the last time.
	useEffect(() => {
		if (!visible || !hostRef.current || !containerRef.current) {
			return;
		}
		terminalService.setContainers(hostRef.current, containerRef.current);
	}, [visible, terminalService, terminalGroupService]);

	// Show the active group, and hide the others. The terminal group service
	// only shows a group while the Terminal view is visible, so it hides them
	// all whenever the groups change; this runs after it does, and undoes that.
	useEffect(() => {
		if (!visible) {
			return;
		}
		const showActiveGroup = () => {
			const activeGroup = terminalGroupService.activeGroup;
			for (const group of terminalGroupService.groups) {
				group.setVisible(group === activeGroup);
				if (group === activeGroup && sizeRef.current.width > 0 && sizeRef.current.height > 0) {
					group.layout(sizeRef.current.width, sizeRef.current.height);
				}
			}
		};
		showActiveGroup();
		const disposables = new DisposableStore();
		disposables.add(terminalGroupService.onDidChangeActiveGroup(showActiveGroup));
		disposables.add(terminalGroupService.onDidChangeGroups(showActiveGroup));
		disposables.add(terminalGroupService.onDidChangeInstances(showActiveGroup));
		return () => disposables.dispose();
	}, [visible, terminalGroupService]);

	// Lay the terminals out to fill the host.
	useEffect(() => {
		if (!visible || width <= 0 || height <= 0) {
			return;
		}
		for (const group of terminalGroupService.groups) {
			group.layout(width, height);
		}
	}, [visible, width, height, terminalGroupService]);

	// Focus the active terminal when the host is shown.
	useEffect(() => {
		if (visible) {
			terminalGroupService.activeInstance?.focusWhenReady(true);
		}
	}, [visible, terminalGroupService]);

	// Render. The `pane-body integrated-terminal` classes give the terminals
	// the styles they have in the Terminal view, which are all scoped to them.
	return (
		<div
			ref={hostRef}
			aria-label={localize('positron.unifiedSessions.terminalPanel', "Terminal")}
			className='unified-terminal-host pane-body integrated-terminal'
			id={UNIFIED_TERMINAL_PANEL_ID}
			role='tabpanel'
			style={{ display: visible ? 'block' : 'none' }}
		>
			<div ref={containerRef} className='terminal-outer-container' />
		</div>
	);
};
