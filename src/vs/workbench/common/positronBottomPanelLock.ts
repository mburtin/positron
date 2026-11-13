/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStorageService, StorageScope, StorageTarget } from '../../platform/storage/common/storage.js';

/**
 * Storage key remembering whether the bottom panel is allowed to be shown. The bottom panel is
 * disabled unless this is explicitly turned on with the "Toggle Bottom Panel Availability" command.
 */
const BOTTOM_PANEL_ENABLED_STORAGE_KEY = 'positron.bottomPanelEnabled';

/**
 * Whether the bottom panel is currently allowed to be shown (false by default).
 */
export function isBottomPanelEnabled(storageService: IStorageService): boolean {
	return storageService.getBoolean(BOTTOM_PANEL_ENABLED_STORAGE_KEY, StorageScope.APPLICATION, false);
}

/**
 * Allows or forbids showing the bottom panel.
 */
export function setBottomPanelEnabled(storageService: IStorageService, enabled: boolean): void {
	storageService.store(BOTTOM_PANEL_ENABLED_STORAGE_KEY, enabled, StorageScope.APPLICATION, StorageTarget.MACHINE);
}
