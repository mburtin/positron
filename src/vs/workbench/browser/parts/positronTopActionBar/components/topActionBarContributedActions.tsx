/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import { JSX } from 'react';

// Other dependencies.
import { MenuItemAction, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { actionTooltip } from '../../../../../platform/positronActionBar/common/helpers.js';
import { ActionBarSeparator } from '../../../../../platform/positronActionBar/browser/components/actionBarSeparator.js';
import { ActionBarMenuButton } from '../../../../../platform/positronActionBar/browser/components/actionBarMenuButton.js';
import { ActionBarActionButton } from '../../../../../platform/positronActionBar/browser/components/actionBarActionButton.js';
import { ActionBarActionToggle } from '../../../../../platform/positronActionBar/browser/components/actionBarActionToggle.js';
import { ActionBarActionCheckbox } from '../../../../../platform/positronActionBar/browser/components/actionBarActionCheckbox.js';
import { isPositronActionBarCheckboxOptions, isPositronActionBarToggleOptions } from '../../../../../platform/action/common/action.js';
import { usePositronReactServicesContext } from '../../../../../base/browser/positronReactRendererContext.js';

/**
 * The actions of a menu, grouped by menu group.
 */
export type TopActionBarActionGroups = [string, (MenuItemAction | SubmenuItemAction)[]][];

/**
 * Determines whether action groups contain at least one action.
 * @param actionGroups The action groups.
 * @returns true if at least one action is present; otherwise, false.
 */
export const hasTopActionBarActions = (actionGroups: TopActionBarActionGroups) =>
	actionGroups.some(([, actions]) => actions.length > 0);

/**
 * TopActionBarContributedActionsProps interface.
 */
interface TopActionBarContributedActionsProps {
	/**
	 * The actions to render, grouped by menu group.
	 */
	readonly actionGroups: TopActionBarActionGroups;

	/**
	 * The context key service used to resolve action tooltips and enablement.
	 */
	readonly contextKeyService: IContextKeyService;

	/**
	 * A value which indicates whether to render a separator ahead of the actions. The separator is
	 * only rendered when there is at least one action.
	 */
	readonly showLeadingSeparator?: boolean;
}

/**
 * Renders actions contributed to a Positron Top Action Bar menu. Actions are grouped by their menu
 * group and separated by separators. Actions that declare a submenu are rendered as drop-down
 * buttons.
 * @param props A TopActionBarContributedActionsProps that contains the component properties.
 * @returns The rendered component.
 */
export const TopActionBarContributedActions = (props: TopActionBarContributedActionsProps) => {
	// Context hooks.
	const services = usePositronReactServicesContext();

	/**
	 * Renders an action.
	 * @param action The action to render.
	 * @param keyPrefix A prefix used to build a unique React key for the action.
	 * @returns The rendered action.
	 */
	const renderAction = (action: MenuItemAction | SubmenuItemAction, keyPrefix: string): JSX.Element => {
		// Render submenu item actions as drop-down buttons. When the submenu declares no icon, fall
		// back to its label so the button remains visible.
		if (action instanceof SubmenuItemAction) {
			return (
				<ActionBarMenuButton
					key={`${keyPrefix}-${action.id}`}
					actions={() => action.actions}
					ariaLabel={action.label ?? action.tooltip}
					icon={action.item.icon}
					label={action.item.icon ? undefined : action.label}
					tooltip={actionTooltip(
						props.contextKeyService,
						services.keybindingService,
						action,
						false
					)}
				/>
			);
		}

		// Render menu item actions using the control type they declare.
		if (isPositronActionBarCheckboxOptions(action.positronActionBarOptions)) {
			return <ActionBarActionCheckbox key={`${keyPrefix}-${action.id}`} action={action} />;
		}
		if (isPositronActionBarToggleOptions(action.positronActionBarOptions)) {
			return <ActionBarActionToggle key={`${keyPrefix}-${action.id}`} action={action} />;
		}
		return <ActionBarActionButton key={`${keyPrefix}-${action.id}`} action={action} />;
	};

	// Render nothing when there are no actions.
	if (!hasTopActionBarActions(props.actionGroups)) {
		return null;
	}

	// Render the actions, separating each group.
	const elements: JSX.Element[] = [];
	if (props.showLeadingSeparator) {
		elements.push(<ActionBarSeparator key='leading-separator' />);
	}
	const separatorCount = props.showLeadingSeparator ? 1 : 0;
	for (const [group, actions] of props.actionGroups) {
		if (!actions.length) {
			continue;
		}
		if (elements.length > separatorCount) {
			elements.push(<ActionBarSeparator key={`separator-${group}`} />);
		}
		for (const action of actions) {
			elements.push(renderAction(action, group));
		}
	}

	return <>{elements}</>;
};
