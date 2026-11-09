/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ChecklistItem, Project } from '../project';

export type ProjectAction = vscode.Uri | { external: vscode.Uri } | 'add-link';

export interface ComponentContext {
	readonly project: Project;
	readonly resource: (uri: vscode.Uri) => string;
	readonly button: (label: string, action: ProjectAction, icons?: { leading: string; trailing?: string }) => string;
	readonly fileList: (files: readonly vscode.Uri[]) => string;
}

export interface ComponentContent {
	readonly body: string;
	readonly headingIcon?: string;
	readonly headerAction?: { label: string; action: ProjectAction; icon: string };
}

export interface DashboardComponent {
	readonly id: string;
	readonly title: string;
	readonly columns: 1 | 2 | 3;
	readonly nav?: boolean;
	readonly metric?: boolean;
	render(context: ComponentContext): ComponentContent;
}

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };

export function escape(value: string): string {
	return value.replace(/[&<>"']/g, char => entities[char]);
}

export function list(items: string[], className = ''): string {
	return `<ul class="${className}">${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
}

export function empty(message: string): string {
	return `<p class="muted">${escape(message)}</p>`;
}

export function progress(items: ChecklistItem[], label: string): string {
	if (!items.length) {
		return '';
	}
	const count = items.filter(item => item.done).length;
	return `<progress aria-label="${escape(label)}" max="${items.length}" value="${count}"></progress>`;
}

export function status(done: boolean): string {
	const label = done ? vscode.l10n.t("Done") : vscode.l10n.t("Open");
	return `<span class="status ${done ? 'done' : ''}"><span aria-hidden="true">${done ? '✓' : '○'}</span><span class="sr-only">${escape(label)}</span></span>`;
}

export function checklist(items: ChecklistItem[]): string {
	return list(items.map(item => `${status(item.done)}<span class="grow">${escape(item.title)}</span>
		${item.tag ? `<span class="pill">${escape(item.tag)}</span>` : ''}`));
}
