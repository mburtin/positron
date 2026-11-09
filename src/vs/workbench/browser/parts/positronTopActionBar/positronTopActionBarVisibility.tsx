/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// Other dependencies.
import { useContextKey } from '../../../../base/browser/positronReactHooks.js';
import {
	PositronTopActionBarCommandCenterVisible,
	PositronTopActionBarCustomFolderMenuVisible,
	PositronTopActionBarNavigationVisible,
	PositronTopActionBarNewMenuVisible,
	PositronTopActionBarOpenMenuVisible,
	PositronTopActionBarSaveAllVisible,
	PositronTopActionBarSessionPickerVisible,
} from '../../../common/contextkeys.js';

/**
 * TopActionBarVisibility interface. Each element of the Positron Top Action Bar that can be hidden
 * by an extension.
 */
export interface TopActionBarVisibility {
	readonly commandCenter: boolean;
	readonly customFolderMenu: boolean;
	readonly navigation: boolean;
	readonly newMenu: boolean;
	readonly openMenu: boolean;
	readonly saveAll: boolean;
	readonly sessionPicker: boolean;
}

/**
 * useTopActionBarVisibility hook. Observes the context keys that control the visibility of the
 * built-in elements of the Positron Top Action Bar. Elements default to visible.
 * @returns The visibility of each built-in element.
 */
export const useTopActionBarVisibility = (): TopActionBarVisibility => ({
	commandCenter: useContextKey(PositronTopActionBarCommandCenterVisible) ?? true,
	customFolderMenu: useContextKey(PositronTopActionBarCustomFolderMenuVisible) ?? true,
	navigation: useContextKey(PositronTopActionBarNavigationVisible) ?? true,
	newMenu: useContextKey(PositronTopActionBarNewMenuVisible) ?? true,
	openMenu: useContextKey(PositronTopActionBarOpenMenuVisible) ?? true,
	saveAll: useContextKey(PositronTopActionBarSaveAllVisible) ?? true,
	sessionPicker: useContextKey(PositronTopActionBarSessionPickerVisible) ?? true,
});
