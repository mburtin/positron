/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import { useCallback, useEffect, useState } from 'react';

// Other dependencies.
import { IReactComponentContainer } from '../../../../base/browser/positronReactRenderer.js';
import { usePositronReactServicesContext } from '../../../../base/browser/positronReactRendererContext.js';
import { VerticalSplitter, VerticalSplitterResizeParams } from '../../../../base/browser/ui/positronComponents/splitters/verticalSplitter.js';
import { RuntimeStartupPhase } from '../../../services/languageRuntime/common/languageRuntimeService.js';
import { ActionBar } from '../../positronConsole/browser/components/actionBar.js';
import { ConsoleInstance } from '../../positronConsole/browser/components/consoleInstance.js';
import { EmptyConsole } from '../../positronConsole/browser/components/emptyConsole.js';
import { StartupStatus } from '../../positronConsole/browser/components/startupStatus.js';
import { usePositronConsoleContext } from '../../positronConsole/browser/positronConsoleContext.js';
import { ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { IUnifiedSessionsState } from '../common/unifiedSessions.js';
import { UnifiedSessionsTabList } from './unifiedSessionsTabList.js';
import { UnifiedTerminalHost } from './unifiedTerminalHost.js';
import { getTabListWidth, MINIMUM_PANE_WIDTH, MINIMUM_TAB_LIST_WIDTH } from './unifiedSessionsLayout.js';

// Constants.
const ACTION_BAR_HEIGHT = 28;

/**
 * UnifiedSessionsCoreProps interface.
 */
interface UnifiedSessionsCoreProps {
	readonly reactComponentContainer: IReactComponentContainer;
	readonly terminalService: ITerminalService;
	readonly terminalGroupService: ITerminalGroupService;
	readonly unifiedState: IUnifiedSessionsState;
}

/**
 * UnifiedSessionsCore component. Lays out the unified tab list next to the
 * selected console session or terminal.
 * @param props The component properties.
 * @returns The rendered component.
 */
export const UnifiedSessionsCore = (props: UnifiedSessionsCoreProps) => {
	// Context hooks.
	const services = usePositronReactServicesContext();
	const positronConsoleContext = usePositronConsoleContext();

	// State hooks.
	const [width, setWidth] = useState(() => props.reactComponentContainer.width);
	const [height, setHeight] = useState(() => props.reactComponentContainer.height);
	const [userTabListWidth, setUserTabListWidth] = useState<number | undefined>(undefined);
	const [startupPhase, setStartupPhase] = useState(() => services.languageRuntimeService.startupPhase);
	const [terminals, setTerminals] = useState<readonly ITerminalInstance[]>([]);
	const [selectedTerminalId, setSelectedTerminalId] = useState(() => props.unifiedState.selectedTerminalId);

	// Track the size of the container.
	useEffect(() => {
		const disposable = props.reactComponentContainer.onSizeChanged(size => {
			setWidth(size.width);
			setHeight(size.height);
		});
		return () => disposable.dispose();
	}, [props.reactComponentContainer]);

	// Track the runtime startup phase. The phase is re-read first to close the
	// race between the initial state and the subscription.
	useEffect(() => {
		setStartupPhase(services.languageRuntimeService.startupPhase);
		const disposable = services.languageRuntimeService.onDidChangeRuntimeStartupPhase(setStartupPhase);
		return () => disposable.dispose();
	}, [services.languageRuntimeService]);

	// Track the terminal instances.
	useEffect(() => {
		setTerminals([...props.terminalGroupService.instances]);
		const refresh = () => setTerminals([...props.terminalGroupService.instances]);
		const instancesDisposable = props.terminalService.onDidChangeInstances(refresh);
		const groupsDisposable = props.terminalGroupService.onDidChangeGroups(refresh);
		return () => {
			instancesDisposable.dispose();
			groupsDisposable.dispose();
		};
	}, [props.terminalGroupService, props.terminalService]);

	// Track which terminal is selected. The selection is kept outside this
	// component so that other things (such as showing the terminal from a
	// command) can change it.
	useEffect(() => {
		setSelectedTerminalId(props.unifiedState.selectedTerminalId);
		const disposable = props.unifiedState.onDidChangeSelection(setSelectedTerminalId);
		return () => disposable.dispose();
	}, [props.unifiedState]);

	// A terminal that no longer exists cannot be selected.
	const selectedTerminal = terminals.find(terminal => terminal.instanceId === selectedTerminalId);

	const handleSelectTerminal = useCallback((terminal: ITerminalInstance) => {
		props.terminalGroupService.setActiveInstance(terminal);
		props.unifiedState.selectTerminal(terminal.instanceId);
	}, [props.terminalGroupService, props.unifiedState]);

	const handleSelectConsole = useCallback(() => {
		props.unifiedState.selectTerminal(undefined);
	}, [props.unifiedState]);

	// Nothing to show: fall back to what the Console shows when it is empty.
	if (positronConsoleContext.positronConsoleInstances.length === 0 && terminals.length === 0) {
		return (
			<div className='positron-console positron-unified-sessions'>
				{startupPhase === RuntimeStartupPhase.Complete ? <EmptyConsole /> : <StartupStatus />}
			</div>
		);
	}

	// Compute the layout.
	const tabListWidth = getTabListWidth(width, userTabListWidth);
	const paneWidth = width - tabListWidth;
	const handleBeginResize = (): VerticalSplitterResizeParams => ({
		minimumWidth: MINIMUM_PANE_WIDTH,
		maximumWidth: width - MINIMUM_TAB_LIST_WIDTH,
		startingWidth: paneWidth,
	});

	// Render.
	return (
		<div className='positron-console positron-unified-sessions'>
			<div className='console-core'>
				<div className='console-pane' style={{ width: paneWidth }}>
					<ActionBar reactComponentContainer={props.reactComponentContainer} />
					{paneWidth > 0 &&
						<div className='console-instances-container' inert={selectedTerminal !== undefined}>
							{positronConsoleContext.positronConsoleInstances.map(instance =>
								<ConsoleInstance
									key={instance.sessionId}
									active={selectedTerminal === undefined && instance.sessionId === positronConsoleContext.activePositronConsoleInstance?.sessionId}
									height={height - ACTION_BAR_HEIGHT}
									positronConsoleInstance={instance}
									reactComponentContainer={props.reactComponentContainer}
									width={paneWidth}
								/>
							)}
						</div>
					}
					{terminals.length > 0 &&
						<UnifiedTerminalHost
							height={height}
							terminalGroupService={props.terminalGroupService}
							terminalService={props.terminalService}
							visible={selectedTerminal !== undefined}
							width={paneWidth}
						/>
					}
				</div>
				<VerticalSplitter
					onBeginResize={handleBeginResize}
					onResize={newPaneWidth => setUserTabListWidth(width - newPaneWidth)}
				/>
				<UnifiedSessionsTabList
					height={height}
					selectedTerminal={selectedTerminal}
					terminalGroupService={props.terminalGroupService}
					terminalService={props.terminalService}
					terminals={terminals}
					unifiedState={props.unifiedState}
					width={tabListWidth}
					onSelectConsole={handleSelectConsole}
					onSelectTerminal={handleSelectTerminal}
				/>
			</div>
		</div>
	);
};
