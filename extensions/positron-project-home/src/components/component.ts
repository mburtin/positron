/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ChecklistItem, FileShortcutSection, Project, ProjectShortcut, TaskEdit } from '../project';

export type TaskAction = { type: 'add-task' }
	| Extract<TaskEdit, { type: 'set-task-done' }>
	| TaskDialogAction;

/** Task actions that collect their input in a dialog inside the dashboard. */
export type TaskDialogAction = { type: 'edit-task-notes'; index: number; title: string; notes: string }
	| { type: 'edit-task-due'; index: number; title: string; due: string }
	| { type: 'add-deadline' };

type FilePinAction = { type: 'add-file'; section: FileShortcutSection }
	| { type: 'set-file-pinned'; section: FileShortcutSection; shortcut: ProjectShortcut; pinned: boolean };

type ManuscriptAction = { type: 'create-manuscript' }
	| { type: 'set-manuscript-chapter-done'; path: string; done: boolean };

export type ProjectAction = vscode.Uri | { type: 'open-link'; url: string } | 'add-link' | FilePinAction | TaskAction | ManuscriptAction;

export interface ButtonOptions {
	readonly leading?: string;
	readonly trailing?: string;
	readonly iconOnly?: boolean;
	readonly opensDialog?: boolean;
	/** Checked state for an action rendered as a checkbox. */
	readonly checked?: boolean;
	/** Tooltip shown on hover, for labels that do not spell out the full target. */
	readonly title?: string;
}

/** Label used for an entry in a file list. */
export type FileLabel = 'path' | 'name';

export interface ComponentContext {
	readonly project: Project;
	readonly button: (label: string, action: ProjectAction, options?: ButtonOptions) => string;
	readonly fileList: (files: readonly vscode.Uri[], label?: FileLabel) => string;
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

export function progress(items: readonly ChecklistItem[], label: string): string {
	if (!items.length) {
		return '';
	}
	const count = items.filter(item => item.done).length;
	return `<progress aria-label="${escape(label)}" max="${items.length}" value="${count}"></progress>`;
}

export function status(done: boolean): string {
	const label = done ? vscode.l10n.t("Done") : vscode.l10n.t("Open");
	return `<span class="status ${done ? 'done' : ''}"><span aria-hidden="true">${done ? '&#10003;' : '&#9675;'}</span><span class="sr-only">${escape(label)}</span></span>`;
}

export function checklist(items: ChecklistItem[]): string {
	return list(items.map(item => `${status(item.done)}<span class="grow">${escape(item.title)}</span>
		${item.tag ? `<span class="pill">${escape(item.tag)}</span>` : ''}`));
}
