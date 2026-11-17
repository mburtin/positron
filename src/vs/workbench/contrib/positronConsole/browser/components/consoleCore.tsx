/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import './consoleCore.css';

// React.
import { useEffect, useState } from 'react';

// Other dependencies.
import { ActionBar } from './actionBar.js';
import { EmptyConsole } from './emptyConsole.js';
import { StartupStatus } from './startupStatus.js';
import { ConsoleTabList } from './consoleTabList.js';
import { useConsoleTabListLayout } from './consoleTabListLayout.js';
import { ConsoleInstance } from './consoleInstance.js';
import { usePositronConsoleContext } from '../positronConsoleContext.js';
import { positronClassNames } from '../../../../../base/common/positronUtilities.js';
import { IReactComponentContainer } from '../../../../../base/browser/positronReactRenderer.js';
import { RuntimeStartupPhase } from '../../../../services/languageRuntime/common/languageRuntimeService.js';
import { usePositronReactServicesContext } from '../../../../../base/browser/positronReactRendererContext.js';
import { VerticalSplitter } from '../../../../../base/browser/ui/positronComponents/splitters/verticalSplitter.js';

// Constants.
const ACTION_BAR_HEIGHT = 28;

// ConsoleCoreProps interface.
interface ConsoleCoreProps {
	readonly width: number;
	readonly height: number;
	readonly reactComponentContainer: IReactComponentContainer;
}

/**
 * ConsoleCore component.
 * @param props A ConsoleCoreProps that contains the component properties.
 * @returns The rendered component.
 */
export const ConsoleCore = (props: ConsoleCoreProps) => {
	// Calculate the adjusted height (the height minus the action bar height).
	const adjustedHeight = props.height - ACTION_BAR_HEIGHT;

	// Context hooks.
	const services = usePositronReactServicesContext();
	const positronConsoleContext = usePositronConsoleContext();

	// State hooks.
	const [startupPhase, setStartupPhase] = useState(services.languageRuntimeService.startupPhase);

	// Main useEffect hook.
	useEffect(() => {
		// Re-read the current phase to close the race between the initial
		// useState snapshot and the subscription below. If the phase changed
		// between component construction and this effect, the update would
		// otherwise be lost.
		setStartupPhase(services.languageRuntimeService.startupPhase);

		const disposables = services.languageRuntimeService.onDidChangeRuntimeStartupPhase(e => {
			setStartupPhase(e);
		});
		return () => disposables.dispose();
	}, [services.languageRuntimeService]);

	const { paneWidth, tabListWidth, compact, splitterProps } =
		useConsoleTabListLayout(props.width, !positronConsoleContext.consoleSessionListCollapsed);

	// If there are no console instances, render the empty console and return.
	if (positronConsoleContext.positronConsoleInstances.length === 0) {
		if (startupPhase === RuntimeStartupPhase.Complete) {
			return <EmptyConsole />;
		} else {
			return <StartupStatus />;
		}
	}

	// Render.
	return (
		<div className={positronClassNames('console-core')}>
			<div className='console-pane' style={{ width: paneWidth }}>
				<ActionBar {...props} showDeleteButton={positronConsoleContext.consoleSessionListCollapsed} />
				{/* #6845 - Only render console instances when the console pane width is greater than 0. */}
				{paneWidth > 0 &&
					<div className='console-instances-container'>
						{positronConsoleContext.positronConsoleInstances.map(positronConsoleInstance =>
							<ConsoleInstance
								key={positronConsoleInstance.sessionId}
								active={positronConsoleInstance.sessionId === positronConsoleContext.activePositronConsoleInstance?.sessionId}
								height={adjustedHeight}
								positronConsoleInstance={positronConsoleInstance}
								reactComponentContainer={props.reactComponentContainer}
								width={paneWidth}
							/>
						)}
					</div>
				}
			</div>
			{tabListWidth > 0 &&
				<VerticalSplitter {...splitterProps} />
			}
			{tabListWidth > 0 &&
				<ConsoleTabList compact={compact} height={props.height} width={tabListWidth} />
			}
		</div>
	);
};
