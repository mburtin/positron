/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export const settingsDirectory = '.nlm-studio';
export const configPath = `${settingsDirectory}/project-home.json`;
export const layoutPath = `${settingsDirectory}/project-home-layout.json`;
export const legacyConfigPath = '.positron/project-home.json';

export function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function asText(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function projectResource(folder: vscode.Uri, path: string): vscode.Uri | undefined {
	const segments = path.split('/');
	if (segments.some(segment => !segment || segment === '.' || segment === '..' || /[\\:\u0000-\u001f]/.test(segment))) {
		return undefined;
	}
	return vscode.Uri.joinPath(folder, ...segments);
}

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
