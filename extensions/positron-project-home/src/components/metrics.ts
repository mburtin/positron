/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DashboardComponent, escape, progress } from './component';
import { icon } from './icons';

export function taskSummary(): DashboardComponent {
	return {
		id: 'task-summary',
		title: vscode.l10n.t("Task Progress"),
		columns: 1,
		metric: true,
		render({ project: { config } }) {
			const { tasks } = config;
			const done = tasks.filter(task => task.done).length;
			return {
				headingIcon: icon('progress'),
				body: `<strong>${done} / ${tasks.length}</strong>${progress(tasks, this.title)}
					<p class="muted">${escape(vscode.l10n.t("{0} open", tasks.length - done))}</p>`,
			};
		},
	};
}
