/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ComponentContext, DashboardComponent, empty, escape, ProjectAction } from './components/component';
import { CardPlacement, maxLayoutRows } from './layout';
import { Project } from './project';
import { configPath } from './settings';

function moveHandle(title: string): string {
	const label = vscode.l10n.t("Move {0} with the arrow keys or drag it", title);
	return `<span class="drag-handle" draggable="true" tabindex="0" role="group" aria-label="${escape(label)}" title="${escape(label)}">&#10303;</span>`;
}

function resizeHandles(title: string): string {
	const horizontal = escape(vscode.l10n.t("Resize {0} horizontally. Use the left and right arrow keys.", title));
	const vertical = escape(vscode.l10n.t("Resize {0} vertically. Use the up and down arrow keys.", title));
	return ['left', 'right', 'top', 'bottom'].map(edge => {
		const label = edge === 'left' || edge === 'right' ? horizontal : vertical;
		return `<span class="resize-handle" data-edge="${edge}" tabindex="0" role="group" aria-label="${label}" title="${label}"></span>`;
	}).join('');
}

function renderComponents(
	context: ComponentContext,
	components: ReadonlyMap<string, DashboardComponent>,
	layout: readonly CardPlacement[],
): string {
	const navigation = [...components.values()].filter(component => component.nav).map(({ id, title }) =>
		`<a href="#${escape(id)}">${escape(title)}</a>`);
	const cards = layout.map(({ id, columns, rows, anchor }) => {
		const component = components.get(id)!;
		const { body, headingIcon, headerAction } = component.render(context);
		return `<section id="${escape(id)}" aria-labelledby="heading-${escape(id)}" data-component="${escape(id)}" data-columns="${columns}" data-rows="${rows}"${anchor ? ` data-anchor="${anchor.join(',')}"` : ''} class="card${component.metric ? ' metric' : ''}">
			<header><h2 id="heading-${escape(id)}"${headingIcon ? ' class="with-icon"' : ''}>${headingIcon ?? ''}${escape(component.title)}</h2>
				${headerAction ? context.button(headerAction.label, headerAction.action, { leading: headerAction.icon, iconOnly: true }) : ''}
				${moveHandle(component.title)}
			</header>
			<div class="card-content">${body}</div>
			${resizeHandles(component.title)}
		</section>`;
	});
	return `<nav aria-label="${escape(vscode.l10n.t("Project Sections"))}">
		<a href="#home">${escape(vscode.l10n.t("Home"))}</a>${navigation.join('')}
	</nav>
	<div class="dashboard" data-max-rows="${maxLayoutRows}">${cards.join('')}</div>`;
}

export function renderDashboard(
	webview: vscode.Webview,
	extensionUri: vscode.Uri,
	clientRoot: vscode.Uri,
	folder: vscode.WorkspaceFolder,
	components: ReadonlyMap<string, DashboardComponent>,
	layout: readonly CardPlacement[],
	project?: Project,
	error = false,
): { html: string; actions: Map<string, ProjectAction> } {
	const actions = new Map<string, ProjectAction>();
	const nonce = crypto.randomUUID();
	const resource = (uri: vscode.Uri) => webview.asWebviewUri(uri).toString();
	const extensionResource = (path: string) => resource(vscode.Uri.joinPath(extensionUri, path));
	const button: ComponentContext['button'] = (label, action, options) => {
		const id = `${nonce}-${actions.size}`;
		actions.set(id, action);
		if (options?.iconOnly) {
			const checked = options.checked === undefined ? '' : ` role="checkbox" aria-checked="${options.checked}"`;
			const popup = options.opensDialog ? ' aria-haspopup="dialog"' : '';
			return `<button type="button" class="card-action" data-action="${id}" aria-label="${escape(label)}" title="${escape(label)}"${checked}${popup}>${options.leading ?? ''}</button>`;
		}
		const title = options?.title ? ` title="${escape(options.title)}"` : '';
		const quickLink = options?.leading || options?.trailing ? ' quick-link' : '';
		return `<button type="button" class="file${quickLink}" data-action="${id}"${title}>${options?.leading ?? ''}<span>${escape(label)}</span>${options?.trailing ?? ''}</button>`;
	};
	const rootLength = folder.uri.path.replace(/\/$/, '').length + 1;
	const fileList: ComponentContext['fileList'] = (files, label = 'path') => `<ul>${files.map(uri => {
		const path = uri.path.slice(rootLength);
		const name = path.slice(path.lastIndexOf('/') + 1);
		return `<li>${button(label === 'name' ? name : path, uri, label === 'name' ? { title: path } : undefined)}</li>`;
	}).join('')}</ul>`;
	const content = project ? renderComponents({ project, button, fileList }, components, layout)
		: error ? `<section class="card"><h2>${escape(vscode.l10n.t("Project Home Could Not Load"))}</h2>
			${empty(vscode.l10n.t("Check that the project folder is available and try again."))}</section>`
			: empty(vscode.l10n.t("Loading project…"));
	const notice = project?.state === 'invalid'
		? `<p class="notice" role="status">${escape(vscode.l10n.t("The project details could not be read. Check {0}.", configPath))}</p>`
		: '';
	const title = project?.config.title ?? folder.name;
	const settingsLabel = escape(vscode.l10n.t("Layout Settings"));

	return {
		actions,
		html: `<!DOCTYPE html>
<html lang="${escape(vscode.env.language)}">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<link rel="stylesheet" href="${escape(extensionResource('media/dashboard.css'))}">
	<title>${escape(title)}</title>
</head>
<body data-project="${escape(folder.uri.toString())}">
	<main id="home">
		<header class="page-header">
			<div class="identity">
				<p class="eyebrow">${escape(vscode.l10n.t("Project Home"))}</p>
				<h1>${escape(title)}</h1>
			</div>
			${project ? `<button id="layout-settings" class="layout-settings" type="button" aria-pressed="false" aria-label="${settingsLabel}" title="${settingsLabel}"><span aria-hidden="true">&#9881;&#65038;</span></button>` : ''}
		</header>
		${notice}${content}
	</main>
	${project ? `<dialog id="task-notes" aria-labelledby="task-notes-heading" aria-describedby="task-notes-title">
		<form method="dialog">
			<h2 id="task-notes-heading">${escape(vscode.l10n.t("Task Notes"))}</h2>
			<p id="task-notes-title" class="muted"></p>
			<label class="sr-only" for="task-notes-text">${escape(vscode.l10n.t("Notes"))}</label>
			<textarea id="task-notes-text" rows="8"></textarea>
			<p id="task-notes-error" role="alert" hidden></p>
			<div class="task-notes-actions">
				<button type="button" id="cancel-task-notes">${escape(vscode.l10n.t("Cancel"))}</button>
				<button type="submit">${escape(vscode.l10n.t("Save Notes"))}</button>
			</div>
		</form>
	</dialog>` : ''}
	<script nonce="${nonce}" src="${escape(resource(vscode.Uri.joinPath(clientRoot, 'dashboardClient.js')))}"></script>
</body>
</html>`,
	};
}
