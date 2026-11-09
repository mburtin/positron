/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { checklist, DashboardComponent, empty, escape, list, progress, status } from './component';
import { icon } from './icons';

export function overview(): DashboardComponent {
	return {
		id: 'overview',
		title: vscode.l10n.t("Project Overview"),
		columns: 3,
		render({ project: { banner, config }, resource }) {
			return {
				body: `${banner ? `<img class="banner" alt="" src="${escape(resource(banner))}">` : ''}
					<div class="identity">
						${config.description ? `<p>${escape(config.description)}</p>` : empty(vscode.l10n.t("Add a description in the project details."))}
						${config.tags.length ? list(config.tags.map(tag => `<span class="pill">${escape(tag)}</span>`), 'tags') : ''}
					</div>`,
			};
		},
	};
}

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
		render({ project: { config, files }, fileList }) {
			const sections = config.manuscript?.sections ?? [];
			return {
				body: `${files.manuscript.length ? fileList(files.manuscript) : empty(vscode.l10n.t("Add a manuscript file in the project details."))}
					${sections.length ? progress(sections, this.title) + checklist(sections) : ''}`,
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
		render({ project, button }) {
			const links = project.links.flatMap(({ label, target, isDirectory }) => {
				if (!target) {
					return [];
				}
				if (!(target instanceof vscode.Uri)) {
					const host = new URL(target.external.toString(true)).hostname;
					const iconName = /(^|\.)github\.com$/.test(host) ? 'github' : /(^|\.)zotero\.org$/.test(host) ? 'cap' : 'link';
					return [button(label, target, { leading: icon(iconName), trailing: icon('external') })];
				}
				const path = target.path;
				const iconName = isDirectory ? 'folder'
					: /\.(csv|tsv|parquet|rds|rdata|xpt|xlsx|sqlite|feather)$/i.test(path) ? 'database'
						: /\.(pdf|docx?|md|qmd|rmd)$/i.test(path) ? 'book' : 'file';
				return [button(label, target, { leading: icon(iconName) })];
			});
			return {
				headingIcon: icon('link'),
				headerAction: { label: vscode.l10n.t("Add Quick Link"), action: 'add-link', icon: icon('add') },
				body: links.length ? list(links) : empty(vscode.l10n.t("Use + to add a project file, folder, or website.")),
			};
		},
	};
}
