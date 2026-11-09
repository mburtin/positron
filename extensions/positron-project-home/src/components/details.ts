/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { projectResource } from '../project';
import { checklist, DashboardComponent, empty, escape, list, progress, ProjectAction, status } from './component';

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
		render({ project: { config }, folder, button }) {
			const links = config.links.flatMap(link => {
				let target: ProjectAction | undefined = projectResource(folder.uri, link.target);
				if (/^https:\/\//i.test(link.target)) {
					try {
						const url = new URL(link.target);
						target = url.username || url.password ? undefined : { external: vscode.Uri.parse(url.href) };
					} catch {
						target = undefined;
					}
				}
				return target ? [button(link.label, target)] : [];
			});
			return { body: links.length ? list(links) : empty(vscode.l10n.t("Add project files or websites in the project details.")) };
		},
	};
}
