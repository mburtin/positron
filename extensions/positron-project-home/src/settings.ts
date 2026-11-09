/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const settingsDirectory = '.nlm-studio';
export const configPath = `${settingsDirectory}/project-home.json`;
export const layoutPath = `${settingsDirectory}/project-home-layout.json`;
export const legacyConfigPath = '.positron/project-home.json';

export async function readOptionalFile(uri: vscode.Uri): Promise<Uint8Array | undefined> {
	try {
		return await vscode.workspace.fs.readFile(uri);
	} catch (error) {
		if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
			return undefined;
		}
		throw error;
	}
}

export async function createFileIfMissing(uri: vscode.Uri, contents: Uint8Array): Promise<void> {
	const edit = new vscode.WorkspaceEdit();
	edit.createFile(uri, { contents, ignoreIfExists: true });
	if (!await vscode.workspace.applyEdit(edit)) {
		throw new Error('Project settings file could not be created');
	}
}

export function encodeSettings(value: object): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(value, null, '\t') + '\n');
}
