/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2022-2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// CSS.
import './positronTopActionBar.css';

// React.
import { useEffect, useState } from 'react';

// Other dependencies.
import { Codicon } from '../../../../base/common/codicons.js';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { isNative } from '../../../../base/common/platform.js';
import { BrowserViewCommandId } from '../../../../platform/browserView/common/browserView.js';
import { CommandCenter } from '../../../../platform/commandCenter/common/commandCenter.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { PositronActionBar } from '../../../../platform/positronActionBar/browser/positronActionBar.js';
// The menu hooks are shared with the Positron notebook action bars.
import { useMenu } from '../../../contrib/positronNotebook/browser/useMenu.js';
import { useMenuActions } from '../../../contrib/positronNotebook/browser/useMenuActions.js';
import { ActionBarRegion } from '../../../../platform/positronActionBar/browser/components/actionBarRegion.js';
import { ActionBarSeparator } from '../../../../platform/positronActionBar/browser/components/actionBarSeparator.js';
import { ActionBarCommandButton } from '../../../../platform/positronActionBar/browser/components/actionBarCommandButton.js';
import { PositronActionBarContextProvider } from '../../../../platform/positronActionBar/browser/positronActionBarContext.js';
import { TopActionBarNewMenu } from './components/topActionBarNewMenu.js';
import { TopActionBarOpenMenu } from './components/topActionBarOpenMenu.js';
import { TopActionBarCommandCenter } from './components/topActionBarCommandCenter.js';
import { PositronTopActionBarContextProvider } from './positronTopActionBarContext.js';
import { TopActionBarCustomFolderMenu } from './components/topActionBarCustomFolderMenu.js';
import { TopActionBarSessionPicker } from './components/topActionBarSessionPicker.js';
import { useTopActionBarVisibility } from './positronTopActionBarVisibility.js';
import { hasTopActionBarActions, TopActionBarContributedActions } from './components/topActionBarContributedActions.js';
import { SAVE_ALL_COMMAND_ID } from '../../../contrib/files/browser/fileConstants.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { LayoutSettings } from '../../../services/layout/browser/layoutService.js';
import { usePositronConfiguration } from '../../../../base/browser/positronReactHooks.js';
import { usePositronReactServicesContext } from '../../../../base/browser/positronReactRendererContext.js';

// Constants.
const kHorizontalPadding = 4;
const kCenterUIBreak = 600;
const kFulllCenterUIBreak = 765;
const SAVE_ALL = SAVE_ALL_COMMAND_ID;

/**
 * IPositronTopActionBarContainer interface.
 */
export interface IPositronTopActionBarContainer {
	/**
	 * Gets the width.
	 */
	readonly width: number;

	/**
	 * onWidthChanged event.
	 */
	readonly onWidthChanged: Event<number>;
}

/**
 * PositronTopActionBarProps interface.
 */
interface PositronTopActionBarProps {
	positronTopActionBarContainer: IPositronTopActionBarContainer;
}

/**
 * PositronTopActionBar component.
 * @param props A PositronTopActionBarProps that contains the component properties.
 * @returns The rendered component.
 */
export const PositronTopActionBar = (props: PositronTopActionBarProps) => {
	// Context hooks.
	const services = usePositronReactServicesContext();
	const contextKeyService = services.contextKeyService;

	// State hooks.
	const [showCenterUI, setShowCenterUI] = useState(
		props.positronTopActionBarContainer.width > kCenterUIBreak
	);
	const [showFullCenterUI, setShowFullCenterUI] = useState(
		props.positronTopActionBarContainer.width > kFulllCenterUIBreak
	);

	// Elements of the top action bar that can be hidden by an extension.
	const visibility = useTopActionBarVisibility();

	// Extension-contributed actions for each region of the top action bar.
	const leftMenu = useMenu(MenuId.PositronTopActionBarLeft, contextKeyService);
	const leftActions = useMenuActions(leftMenu);
	const centerMenu = useMenu(MenuId.PositronTopActionBarCenter, contextKeyService);
	const centerActions = useMenuActions(centerMenu);
	const rightMenu = useMenu(MenuId.PositronTopActionBarRight, contextKeyService);
	const rightActions = useMenuActions(rightMenu);

	// When the title bar hosts the command center, suppress the center region here to avoid duplication.
	const commandCenterInTitleBar = usePositronConfiguration<boolean>(LayoutSettings.COMMAND_CENTER) === true;
	const showBrowserButton = isNative && showFullCenterUI && visibility.navigation;
	const showCenterBuiltins = showCenterUI && !commandCenterInTitleBar && (showBrowserButton || visibility.commandCenter);
	const hasCenterActions = hasTopActionBarActions(centerActions);
	const showCenterRegion = showCenterBuiltins || hasCenterActions;
	// When the browser button remains visible, place replacement actions between the two equal-width
	// side regions, where the command center was.
	const replaceCommandCenter = showCenterBuiltins && !visibility.commandCenter && hasCenterActions;
	const contributedCenterActions = (
		<TopActionBarContributedActions
			actionGroups={centerActions}
			contextKeyService={contextKeyService}
		/>
	);

	// When the left region's built-in actions are hidden, don't render a leading separator for the
	// actions contributed by extensions.
	const showLeftBuiltins = visibility.newMenu || visibility.openMenu || visibility.saveAll;

	// Main useEffect.
	useEffect(() => {
		// Create the disposable store for cleanup.
		const disposableStore = new DisposableStore();

		// Add the width changed event handler.
		disposableStore.add(props.positronTopActionBarContainer.onWidthChanged(width => {
			setShowCenterUI(width > kCenterUIBreak);
			setShowFullCenterUI(width > kFulllCenterUIBreak);
		}));

		// Return the cleanup function that will dispose of the disposables.
		return () => disposableStore.dispose();
	}, [props.positronTopActionBarContainer]);

	// Render.
	return (
		<PositronTopActionBarContextProvider {...props}>
			<PositronActionBarContextProvider {...props}>
				<div className='top-action-bar-container'>
					<PositronActionBar
						borderBottom={false}
						paddingLeft={kHorizontalPadding}
						paddingRight={kHorizontalPadding}
					>
						<ActionBarRegion location='left'>
							{visibility.newMenu && <TopActionBarNewMenu />}
							{visibility.newMenu && visibility.openMenu && <ActionBarSeparator />}
							{visibility.openMenu && <TopActionBarOpenMenu />}
							{(visibility.newMenu || visibility.openMenu) && visibility.saveAll && <ActionBarSeparator />}
							{visibility.saveAll && (
								<ActionBarCommandButton
									ariaLabel={CommandCenter.title(SAVE_ALL)}
									commandId={SAVE_ALL}
									icon={ThemeIcon.fromId('positron-save-all')}
								/>
							)}
							<TopActionBarContributedActions
								actionGroups={leftActions}
								contextKeyService={contextKeyService}
								showLeadingSeparator={showLeftBuiltins}
							/>
						</ActionBarRegion>
						{showCenterRegion && (
							<ActionBarRegion location='center'>
								{showCenterBuiltins && (
									<PositronActionBar nestedActionBar={true}>
										{showFullCenterUI && (
											<ActionBarRegion justify='right' location='left' width={60}>
												{showBrowserButton && (
													<ActionBarCommandButton
														ariaLabel={CommandCenter.title(BrowserViewCommandId.Open)}
														commandId={BrowserViewCommandId.Open}
														icon={Codicon.globe}
													/>
												)}
											</ActionBarRegion>
										)}
										{(visibility.commandCenter || replaceCommandCenter) && (
											<ActionBarRegion location='center'>
												{replaceCommandCenter ? contributedCenterActions : <TopActionBarCommandCenter />}
											</ActionBarRegion>
										)}
										{showFullCenterUI && (
											<ActionBarRegion justify='left' location='right' width={60} />
										)}
									</PositronActionBar>
								)}
								{!replaceCommandCenter && contributedCenterActions}
							</ActionBarRegion>
						)}
						<ActionBarRegion gap={6} location='right'>
							{visibility.sessionPicker && <TopActionBarSessionPicker />}
							{showCenterUI && visibility.customFolderMenu && <TopActionBarCustomFolderMenu />}
							<TopActionBarContributedActions
								actionGroups={rightActions}
								contextKeyService={contextKeyService}
							/>
						</ActionBarRegion>
					</PositronActionBar>
				</div>
			</PositronActionBarContextProvider>
		</PositronTopActionBarContextProvider>
	);
};
