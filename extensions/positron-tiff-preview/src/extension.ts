/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TiffPreviewProvider } from './tiffPreviewProvider';

/**
 * Activate the extension. This runs only when a TIFF file is opened, through the
 * `onCustomEditor` activation event that VS Code derives from `customEditors`.
 */
export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			TiffPreviewProvider.viewType,
			new TiffPreviewProvider(context.extensionUri),
			{ supportsMultipleEditorsPerDocument: true }
		)
	);
}
