/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DashboardComponent, escape } from './component';

export function taskSummary(): DashboardComponent {
	return {
		id: 'task-summary',
		title: vscode.l10n.t("Task Summary"),
		columns: 1,
		metric: true,
		render({ project: { config } }) {
			const done = config.tasks.filter(task => task.done).length;
			return {
				body: `<strong>${done} / ${config.tasks.length}</strong><p class="muted">${escape(vscode.l10n.t("{0} open", config.tasks.length - done))}</p>`,
			};
		},
	};
}
