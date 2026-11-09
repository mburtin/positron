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
	return `<span class="drag-handle" draggable="true" tabindex="0" role="group" aria-label="${escape(label)}" title="${escape(label)}">⠿</span>`;
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
		const { body } = component.render(context);
		return `<section id="${escape(id)}" data-component="${escape(id)}" data-columns="${columns}" data-rows="${rows}"${anchor ? ` data-anchor="${anchor.join(',')}"` : ''} class="card${component.metric ? ' metric' : ''}">
			<header><h2 id="heading-${escape(id)}">${escape(component.title)}</h2>${moveHandle(component.title)}</header>
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
	const button = (label: string, action: ProjectAction) => {
		const id = `${nonce}-${actions.size}`;
		actions.set(id, action);
		return `<button type="button" class="file" data-action="${id}"><span>${escape(label)}</span></button>`;
	};
	const rootLength = folder.uri.path.replace(/\/$/, '').length + 1;
	const fileList = (files: readonly vscode.Uri[]) => `<ul>${files.map(uri => `<li>${button(uri.path.slice(rootLength), uri)}</li>`).join('')}</ul>`;
	const content = project ? renderComponents({ project, folder, resource, button, fileList }, components, layout)
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
	<script nonce="${nonce}" src="${escape(extensionResource('out/dashboardClient.js'))}"></script>
</body>
</html>`,
	};
}
