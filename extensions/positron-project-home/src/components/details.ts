/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { daysUntil, groupByUrgency, toDayString, urgencyOf } from '../deadlines';
import { ProjectTask } from '../project';
import { checklist, ComponentContext, DashboardComponent, empty, escape, list, progress, status } from './component';
import { icon } from './icons';

/** Describes how far away a due date is, relative to today. */
function relativeDue(due: string, today: string): string {
	const days = daysUntil(due, today);
	if (days < -1) {
		return vscode.l10n.t("Overdue by {0} days", -days);
	}
	return days === -1 ? vscode.l10n.t("Due yesterday")
		: days === 0 ? vscode.l10n.t("Due today")
			: days === 1 ? vscode.l10n.t("Due tomorrow")
				: vscode.l10n.t("Due in {0} days", days);
}

/** Formats a calendar date in the user's language without shifting it through a time zone. */
function formatDay(due: string): string {
	const [year, month, day] = due.split('-').map(Number);
	return new Date(year, month - 1, day).toLocaleDateString(vscode.env.language, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Shows a due date, highlighting it when an open task is overdue or due soon. */
function dueBadge(due: string, today: string, done: boolean): string {
	const urgency = done ? 'done' : urgencyOf(due, today);
	return `<span class="due due-${urgency}" title="${escape(formatDay(due))}">${escape(relativeDue(due, today))}</span>`;
}

/** Opens the dialog that sets or clears the due date of a task. */
function dueButton(task: ProjectTask, button: ComponentContext['button']): string {
	const label = task.due ? vscode.l10n.t("Change Due Date for {0}", task.title) : vscode.l10n.t("Set Due Date for {0}", task.title);
	return button(label, { type: 'edit-task-due', index: task.index, title: task.title, due: task.due ?? '' }, {
		iconOnly: true, opensDialog: true, leading: icon('calendar'),
	});
}

export function tasks(): DashboardComponent {
	return {
		id: 'tasks',
		title: vscode.l10n.t("Tasks"),
		columns: 2,
		nav: true,
		render({ project: { config }, button }) {
			const today = toDayString(new Date());
			const open: string[] = [];
			const completed: string[] = [];
			for (const item of config.tasks) {
				const toggle = button(item.title, { type: 'set-task-done', index: item.index, done: !item.done }, {
					iconOnly: true, leading: status(item.done), checked: item.done,
				});
				const hasNotes = !!item.notes?.trim();
				const notes = button(hasNotes ? vscode.l10n.t("Edit Notes for {0}", item.title) : vscode.l10n.t("Add Notes for {0}", item.title), {
					type: 'edit-task-notes', index: item.index, title: item.title, notes: item.notes ?? '',
				}, { iconOnly: true, opensDialog: true, leading: icon('note') });
				(item.done ? completed : open).push(`${toggle}<div class="grow">${escape(item.title)}
					${item.due ? `<div class="task-due">${dueBadge(item.due, today, item.done)}</div>` : ''}</div>
					${item.tag ? `<span class="pill">${escape(item.tag)}</span>` : ''}${dueButton(item, button)}${notes}`);
			}
			const activeTasks = open.length ? list(open, 'task-list')
				: empty(completed.length ? vscode.l10n.t("No open tasks.") : vscode.l10n.t("Use + to add a task."));
			return {
				headingIcon: icon('tasks'),
				headerAction: { label: vscode.l10n.t("Add Task"), action: { type: 'add-task' }, icon: icon('add') },
				body: `${activeTasks}${completed.length ? `<details id="completed-tasks">
					<summary>${escape(vscode.l10n.t("Completed Tasks ({0})", completed.length))}</summary>
					${list(completed, 'task-list')}
				</details>` : ''}`,
			};
		},
	};
}

export function manuscript(): DashboardComponent {
	return {
		id: 'manuscript',
		title: vscode.l10n.t("Manuscript"),
		columns: 1,
		nav: true,
		render({ project: { config, files, manuscriptBook, manuscriptFolder }, button, fileList }) {
			const headingIcon = icon('file');
			if (manuscriptBook) {
				const completed = new Set(config.manuscript?.completedChapters);
				const chapters = manuscriptBook.chapters.map(chapter => ({ ...chapter, done: completed.has(chapter.path) }));
				const done = chapters.filter(chapter => chapter.done).length;
				const percent = chapters.length ? Math.floor(100 * done / chapters.length) : 0;
				const title = manuscriptBook.title ?? this.title;
				return {
					headingIcon,
					headerAction: {
						label: vscode.l10n.t("Open Manuscript"),
						action: chapters[0]?.uri ?? manuscriptBook.directory,
						icon: icon('external'),
					},
					body: `<div class="manuscript-summary"><strong>${escape(title)}</strong>
						<span class="pill">${escape(percent === 100 ? vscode.l10n.t("Complete") : vscode.l10n.t("Draft"))}</span></div>
						${chapters.length ? `<div class="manuscript-summary">
							${progress(chapters, vscode.l10n.t("Manuscript Progress"))}
							<span aria-hidden="true">${escape(vscode.l10n.t("{0}%", percent))}</span></div>
							${list(chapters.map(({ title, path, uri, done }) => {
								const toggle = button(vscode.l10n.t("Completion of {0}", title), { type: 'set-manuscript-chapter-done', path, done: !done }, {
									iconOnly: true, checked: done, leading: status(done),
								});
								return `${toggle}<div class="grow">${button(title, uri, { title: path })}</div>`;
							}), 'manuscript-chapters')}` : empty(vscode.l10n.t("Add chapters to the Quarto book to see them here."))}`,
				};
			}
			const sections = config.manuscript?.sections ?? [];
			const entry = files.manuscript.length ? fileList(files.manuscript)
				: manuscriptFolder ? button(vscode.l10n.t("Open Manuscript Folder"), manuscriptFolder)
					: `<div class="manuscript-create">${button(vscode.l10n.t("Create Manuscript"), { type: 'create-manuscript' })}</div>`;
			return {
				headingIcon,
				body: `${entry}${sections.length ? progress(sections, this.title) + checklist(sections) : ''}`,
			};
		},
	};
}

/** Lists the open tasks that have a due date, grouped by how soon they are due. */
export function deadlines(): DashboardComponent {
	return {
		id: 'deadlines',
		title: vscode.l10n.t("Deadlines"),
		columns: 1,
		render({ project: { config }, button }) {
			const today = toDayString(new Date());
			const dated = config.tasks.filter((task): task is ProjectTask & { due: string } => !task.done && task.due !== undefined);
			const groups = groupByUrgency(dated, today);
			const sections = [
				{ urgency: 'overdue', heading: vscode.l10n.t("Overdue") },
				{ urgency: 'upcoming', heading: vscode.l10n.t("Next 7 Days") },
				{ urgency: 'later', heading: vscode.l10n.t("Later") },
			] as const;
			const body = sections.filter(({ urgency }) => groups[urgency].length).map(({ urgency, heading }) => {
				const items = groups[urgency].map(task => {
					const toggle = button(task.title, { type: 'set-task-done', index: task.index, done: true }, {
						iconOnly: true, leading: status(false), checked: false,
					});
					return `${toggle}<div class="grow">${escape(task.title)}
						<div class="task-due">${dueBadge(task.due, today, false)}
							<span class="muted">${escape(formatDay(task.due))}</span></div></div>${dueButton(task, button)}`;
				});
				return `<h3 class="deadline-heading deadline-${urgency}">${escape(heading)}</h3>${list(items, 'task-list')}`;
			});
			return {
				headingIcon: icon('calendar'),
				headerAction: { label: vscode.l10n.t("Add Deadline"), action: { type: 'add-deadline' }, icon: icon('add') },
				body: body.length ? body.join('') : empty(vscode.l10n.t("Set a due date on a task or use + to add a deadline.")),
			};
		},
	};
}

export function quickLinks(): DashboardComponent {
	return {
		id: 'quick-links',
		title: vscode.l10n.t("Quick Links"),
		columns: 1,
		render({ project: { links }, button }) {
			const items = links.map(({ label, url }) => {
				const host = new URL(url).hostname;
				const iconName = /(^|\.)github\.com$/.test(host) ? 'github' : /(^|\.)zotero\.org$/.test(host) ? 'cap' : 'link';
				return button(label, { type: 'open-link', url }, { leading: icon(iconName) });
			});
			return {
				headingIcon: icon('link'),
				headerAction: { label: vscode.l10n.t("Add Quick Link"), action: 'add-link', icon: icon('add') },
				body: items.length ? list(items) : empty(vscode.l10n.t("Use + to add an HTTPS link.")),
			};
		},
	};
}
