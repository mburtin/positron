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
		render({ project: { config } }) {
			return {
				body: config.tasks.length ? checklist(config.tasks) : empty(vscode.l10n.t("Add tasks in the project details to track progress.")),
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
				body: config.milestones.length ? list(config.milestones.map(item => `${status(item.done)}
					<span class="grow">${escape(item.title)}</span><span class="muted">${escape(item.date)}</span>`))
					: empty(vscode.l10n.t("No milestones defined.")),
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
