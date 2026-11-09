/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { createFileIfMissing, encodeSettings, layoutPath, readOptionalFile, settingsDirectory } from './settings';

export const maxLayoutRows = 12;

export interface CardPlacement {
	readonly id: string;
	readonly columns: number;
	readonly rows: number;
	readonly anchor?: readonly [row: number, column: number, gridColumns: number];
}

type CardDefaults = ReadonlyMap<string, { readonly columns: number }>;

function span(value: unknown, maximum: number, fallback: number): number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= maximum ? value : fallback;
}

function readAnchor(value: unknown): CardPlacement['anchor'] {
	if (!Array.isArray(value) || value.length !== 3) {
		return undefined;
	}
	const [row, column, gridColumns] = value;
	if (span(row, 1000, 0) && span(gridColumns, 3, 0) && span(column, gridColumns, 0)) {
		return [row, column, gridColumns];
	}
	return undefined;
}

/** Reconciles saved sizes and order with the registry, including older order-only layouts. */
export function resolveLayout(defaults: CardDefaults, saved?: unknown): CardPlacement[] {
	const remaining = new Map(defaults);
	const layout: CardPlacement[] = [];
	if (Array.isArray(saved)) {
		for (const entry of saved) {
			const id = typeof entry === 'string' ? entry : entry?.id;
			const component = typeof id === 'string' ? remaining.get(id) : undefined;
			if (component) {
				remaining.delete(id);
				layout.push({
					id,
					columns: span(entry?.columns, 3, component.columns),
					rows: span(entry?.rows, maxLayoutRows, 1),
					anchor: readAnchor(entry?.anchor),
				});
			}
		}
	}
	return [...layout, ...Array.from(remaining, ([id, component]) => ({ id, columns: component.columns, rows: 1 }))];
}

/** Reads the project file and imports the old profile layout if the project has no saved layout. */
export async function loadLayout(folder: vscode.Uri, defaults: CardDefaults, legacy: unknown): Promise<CardPlacement[]> {
	const uri = vscode.Uri.joinPath(folder, layoutPath);
	try {
		const bytes = await readOptionalFile(uri);
		if (bytes) {
			return resolveLayout(defaults, JSON.parse(new TextDecoder().decode(bytes)));
		}
	} catch {
		return resolveLayout(defaults);
	}

	const layout = resolveLayout(defaults, legacy);
	if (Array.isArray(legacy)) {
		try {
			await createFileIfMissing(uri, encodeSettings(layout));
			// Another window may have created a layout while the migration was pending.
			const bytes = await readOptionalFile(uri);
			if (bytes) {
				return resolveLayout(defaults, JSON.parse(new TextDecoder().decode(bytes)));
			}
		} catch {
			// Keep the profile layout available in read-only projects.
		}
	}
	return layout;
}

export async function saveLayout(folder: vscode.Uri, layout: readonly CardPlacement[]): Promise<void> {
	await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder, settingsDirectory));
	await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(folder, layoutPath), encodeSettings(layout));
}
