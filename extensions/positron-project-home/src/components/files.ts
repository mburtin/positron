/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { FileShortcutSection, ProjectShortcut } from '../project';
import { ComponentContext, DashboardComponent, empty, list } from './component';
import { icon, pinIcon } from './icons';

function fileRow(button: ComponentContext['button'], section: FileShortcutSection, file: ProjectShortcut & { uri: vscode.Uri }, pinned: boolean): string {
	const { label, target, uri } = file;
	const open = button(label, uri, { leading: section === 'documents' ? icon('file') : undefined, title: target });
	const pin = button(pinned ? vscode.l10n.t("Unpin {0}", label) : vscode.l10n.t("Pin {0}", label), {
		type: 'set-file-pinned', section, shortcut: { label, target }, pinned: !pinned,
	}, { leading: pinIcon(pinned), iconOnly: true });
	return `<div class="grow">${open}</div>${pin}`;
}

export function documentation(): DashboardComponent {
	return {
		id: 'docs',
		title: vscode.l10n.t("Documentation"),
		columns: 1,
		nav: true,
		render({ project: { documents }, button }) {
			return {
				headingIcon: icon('book'),
				headerAction: { label: vscode.l10n.t("Pin Document"), action: { type: 'add-file', section: 'documents' }, icon: icon('add') },
				body: documents.length ? list(documents.map(file => fileRow(button, 'documents', file, true)), 'file-list')
					: empty(vscode.l10n.t("Use + to pin a project document.")),
			};
		},
	};
}

export function data(): DashboardComponent {
	return {
		id: 'data',
		title: vscode.l10n.t("Data"),
		columns: 1,
		nav: true,
		render({ project: { data }, button }) {
			return {
				headingIcon: icon('database'),
				headerAction: { label: vscode.l10n.t("Pin Data File"), action: { type: 'add-file', section: 'data' }, icon: icon('add') },
				body: data.length ? list(data.map(file => fileRow(button, 'data', file, file.pinned)), 'file-list')
					: empty(vscode.l10n.t("Use + to pin a project data file.")),
			};
		},
	};
}
