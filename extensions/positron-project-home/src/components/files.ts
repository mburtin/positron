/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Project } from '../project';
import { DashboardComponent, empty } from './component';

function fileSection(id: keyof Project['files'], title: string): DashboardComponent {
	return {
		id,
		title,
		columns: 1,
		nav: true,
		render({ project: { files }, fileList }) {
			return { body: files[id].length ? fileList(files[id]) : empty(vscode.l10n.t("No matching files in this project.")) };
		},
	};
}

export function fileSections(): DashboardComponent[] {
	return [
		fileSection('docs', vscode.l10n.t("Documentation")),
		fileSection('data', vscode.l10n.t("Data")),
		fileSection('journal', vscode.l10n.t("Journal")),
	];
}
