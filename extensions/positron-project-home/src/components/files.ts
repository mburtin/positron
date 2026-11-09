/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Project } from '../project';
import { DashboardComponent, empty, FileLabel } from './component';
import { icon, IconName } from './icons';

interface FileSectionOptions {
	readonly label?: FileLabel;
	readonly icon?: IconName;
}

function fileSection(id: keyof Project['files'], title: string, options: FileSectionOptions = {}): DashboardComponent {
	return {
		id,
		title,
		columns: 1,
		nav: true,
		render({ project: { files }, fileList }) {
			return {
				headingIcon: options.icon && icon(options.icon),
				body: files[id].length ? fileList(files[id], options.label) : empty(vscode.l10n.t("No matching files in this project.")),
			};
		},
	};
}

export function fileSections(): DashboardComponent[] {
	return [
		fileSection('docs', vscode.l10n.t("Documentation")),
		fileSection('data', vscode.l10n.t("Data"), { label: 'name', icon: 'database' }),
		fileSection('journal', vscode.l10n.t("Journal")),
	];
}
