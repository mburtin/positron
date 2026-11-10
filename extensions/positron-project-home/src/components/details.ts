/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { checklist, DashboardComponent, empty, escape, list, progress, status } from './component';
import { icon } from './icons';

export function tasks(): DashboardComponent {
	return {
		id: 'tasks',
		title: vscode.l10n.t("Tasks"),
		columns: 2,
		nav: true,
		render({ project: { config }, button }) {
			const open: string[] = [];
			const completed: string[] = [];
			for (const milestone of [undefined, ...config.milestones]) {
				for (const item of milestone?.tasks ?? config.tasks) {
					const target = { milestone: milestone?.index, index: item.index };
					const toggle = button(item.title, { ...target, type: 'set-task-done', done: !item.done }, {
						iconOnly: true, leading: status(item.done), checked: item.done,
					});
					const hasNotes = !!item.notes?.trim();
					const notes = button(hasNotes ? vscode.l10n.t("Edit Notes for {0}", item.title) : vscode.l10n.t("Add Notes for {0}", item.title), {
						...target, type: 'edit-task-notes', title: item.title, notes: item.notes ?? '',
					}, { iconOnly: true, opensDialog: true, leading: icon(hasNotes ? 'written-note' : 'note') });
					const move = config.milestones.length ? button(milestone?.title ?? vscode.l10n.t("Assign Milestone"), {
						...target, type: 'move-task', title: item.title,
					}, { title: vscode.l10n.t("Move Task: {0}", item.title) }) : '';
					(item.done ? completed : open).push(`${toggle}<div class="grow">${escape(item.title)}
						${move ? `<div class="task-milestone">${move}</div>` : ''}</div>
						${item.tag ? `<span class="pill">${escape(item.tag)}</span>` : ''}${notes}`);
				}
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

export function milestones(): DashboardComponent {
	return {
		id: 'milestones',
		title: vscode.l10n.t("Milestones"),
		columns: 1,
		render({ project: { config } }) {
			return {
				headingIcon: icon('milestone'),
				headerAction: { label: vscode.l10n.t("Add Milestone"), action: { type: 'add-milestone' }, icon: icon('add') },
				body: config.milestones.length ? list(config.milestones.map(item => {
					const done = item.tasks.filter(task => task.done).length;
					return `${status(item.legacyDone || (item.tasks.length > 0 && done === item.tasks.length))}
						<div class="grow">${escape(item.title)}
							${progress(item.tasks, vscode.l10n.t("Progress for {0}", item.title))}
							<p class="muted">${escape(item.tasks.length ? vscode.l10n.t("{0} of {1} tasks complete", done, item.tasks.length)
								: vscode.l10n.t("No tasks yet."))}</p>
						</div>${item.date ? `<span class="muted">${escape(item.date)}</span>` : ''}`;
				})) : empty(vscode.l10n.t("Use + to add a milestone.")),
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
