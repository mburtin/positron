/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { checklist, DashboardComponent, empty, escape, list, progress, status } from './component';

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

const linkIcons = {
	add: 'M8 3v10M3 8h10',
	link: 'M6.5 9.5l3-3M6 5l2-2a3.5 3.5 0 0 1 5 5l-2 2M5 6l-2 2a3.5 3.5 0 0 0 5 5l2-2',
	external: 'M9 2.5h4.5V7M13.5 2.5l-6 6M6.5 3.5h-4v10h10v-4',
	folder: 'M1.5 13V3h4.25l2 2h6.75v8z',
	file: 'M3.5 14V2h5l4 4v8zM8.5 2v4h4',
	database: 'M13 4c0 1.1-2.2 2-5 2S3 5.1 3 4s2.2-2 5-2 5 .9 5 2zM3 4v8c0 1.1 2.2 2 5 2s5-.9 5-2V4M3 8c0 1.1 2.2 2 5 2s5-.9 5-2',
	book: 'M8 4v10M8 4C6.5 2.5 4 2.25 1.5 3v10c2.5-.75 5-.5 6.5 1 1.5-1.5 4-1.75 6.5-1V3C12 2.25 9.5 2.5 8 4z',
	cap: 'M1 6l7-3.5L15 6l-7 3.5zM4 7.5V11c2.5 2 5.5 2 8 0V7.5M15 6v4',
};

/** Draws the panel's icons in the current theme color. */
function linkIcon(name: keyof typeof linkIcons | 'github'): string {
	if (name === 'github') {
		// GitHub mark from the workbench chat setup.
		return `<svg class="quick-link-icon" viewBox="0 0 98 96" aria-hidden="true"><path fill="currentColor" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"/></svg>`;
	}
	return `<svg class="quick-link-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="${linkIcons[name]}" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
					const icon = /(^|\.)github\.com$/.test(host) ? 'github' : /(^|\.)zotero\.org$/.test(host) ? 'cap' : 'link';
					return [button(label, target, { leading: linkIcon(icon), trailing: linkIcon('external') })];
				}
				const path = target.path;
				const icon = isDirectory ? 'folder'
					: /\.(csv|tsv|parquet|rds|rdata|xpt|xlsx|sqlite|feather)$/i.test(path) ? 'database'
						: /\.(pdf|docx?|md|qmd|rmd)$/i.test(path) ? 'book' : 'file';
				return [button(label, target, { leading: linkIcon(icon) })];
			});
			return {
				headingIcon: linkIcon('link'),
				headerAction: { label: vscode.l10n.t("Add Quick Link"), action: 'add-link', icon: linkIcon('add') },
				body: links.length ? list(links) : empty(vscode.l10n.t("Use + to add a project file, folder, or website.")),
			};
		},
	};
}
