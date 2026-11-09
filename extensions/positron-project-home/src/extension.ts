/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProjectAction, TaskAction } from './components/component';
import { createComponents } from './components/registry';
import { renderDashboard } from './dashboard';
import { loadLayout, resolveLayout, saveLayout } from './layout';
import { appendProjectLink, editProjectTasks, loadProject, Project, ProjectDetailsError, resolveLinkTarget, TaskEdit } from './project';
import { configPath, legacyConfigPath } from './settings';

const viewType = 'positron.projectHome';

/** Collects the label and target using the workbench's input controls. */
async function promptForLink(folder: vscode.Uri) {
	const label = await vscode.window.showInputBox({
		title: vscode.l10n.t("Add Quick Link"),
		prompt: vscode.l10n.t("Enter the name to show on the project home page"),
		validateInput: value => value.trim() ? undefined : vscode.l10n.t("Enter a link name."),
	});
	if (label === undefined) {
		return undefined;
	}
	const target = await vscode.window.showInputBox({
		title: vscode.l10n.t("Add Quick Link"),
		prompt: vscode.l10n.t("Enter an HTTPS URL or a path relative to the project folder"),
		placeHolder: 'https://…',
		validateInput: value => resolveLinkTarget(folder, value.trim()) ? undefined
			: vscode.l10n.t("Enter a valid HTTPS URL without credentials or a project-relative path."),
	});
	return target === undefined ? undefined : { label: label.trim(), target: target.trim() };
}

/** Collects any input needed for a task action before opening the project details for writing. */
async function promptForTaskEdit(action: Exclude<TaskAction, { type: 'edit-task-notes' }>, { config }: Project): Promise<TaskEdit | undefined> {
	if (action.type === 'set-task-done') {
		return action;
	}
	if (action.type === 'add-milestone' || action.type === 'add-task') {
		const title = (await vscode.window.showInputBox({
			title: action.type === 'add-milestone' ? vscode.l10n.t("Add Milestone") : vscode.l10n.t("Add Task"),
			prompt: vscode.l10n.t("Enter a title"),
			validateInput: value => value.trim() ? undefined : vscode.l10n.t("Enter a title."),
		}))?.trim();
		if (!title) {
			return undefined;
		}
		if (action.type === 'add-milestone' || !config.milestones.length) {
			return { type: action.type, title };
		}
		const destination = await pickMilestone(config.milestones, title);
		return destination && { type: 'add-task', title, milestone: destination.index };
	}
	const destination = await pickMilestone(config.milestones, action.title, action);
	return destination && { ...action, destination: destination.index };
}

/** Selects a destination for a new or existing task. */
function pickMilestone(milestones: Project['config']['milestones'], title: string, move?: { milestone?: number }) {
	const items = [
		{ label: vscode.l10n.t("No Milestone"), description: undefined, index: undefined },
		...milestones.map(({ title, date, index }) => ({ label: title, description: date, index })),
	].filter(item => !move || item.index !== move.milestone);
	return vscode.window.showQuickPick(items, {
		title: title,
		placeHolder: vscode.l10n.t("Choose a milestone for this task"),
	});
}

export function activate(context: vscode.ExtensionContext): void {
	const panels = new Map<string, vscode.WebviewPanel>();
	const components = createComponents();
	const pendingSaves = new Map<string, Promise<void>>();
	const editingDetails = new Set<string>();

	const options = (folder: vscode.WorkspaceFolder): vscode.WebviewOptions => ({
		enableScripts: true,
		localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media'), vscode.Uri.joinPath(context.extensionUri, 'out'), folder.uri],
	});

	const bindPanel = (folder: vscode.WorkspaceFolder, panel: vscode.WebviewPanel) => {
		const key = folder.uri.toString();
		const legacyLayout = context.globalState.get(`layout:${key}`);
		let layout = resolveLayout(components, legacyLayout);
		let layoutRevision = 0;
		panels.set(key, panel);
		panel.webview.options = options(folder);
		panel.title = vscode.l10n.t("Project: {0}", folder.name);
		panel.iconPath = new vscode.ThemeIcon('home');

		let loading: vscode.CancellationTokenSource | undefined;
		let actions = new Map<string, ProjectAction>();
		let renderedProject: Project | undefined;
		let notesEditor: { action: Extract<TaskAction, { type: 'edit-task-notes' }>; revision: string; saving: boolean } | undefined;
		const setPage = (project?: Project, error?: boolean) => {
			if (notesEditor) {
				return;
			}
			const page = renderDashboard(panel.webview, context.extensionUri, folder, components, layout, project, error);
			actions = page.actions;
			renderedProject = project;
			panel.webview.html = page.html;
			if (project) {
				panel.title = vscode.l10n.t("Project: {0}", project.config.title ?? folder.name);
			}
		};
		const refresh = async () => {
			if (notesEditor) {
				return;
			}
			loading?.cancel();
			loading?.dispose();
			const request = new vscode.CancellationTokenSource();
			loading = request;
			try {
				const revision = layoutRevision;
				const [project, savedLayout] = await Promise.all([
					loadProject(folder, request.token),
					(pendingSaves.get(key) ?? Promise.resolve()).then(() => loadLayout(folder.uri, components, legacyLayout)),
				]);
				if (loading === request) {
					if (revision === layoutRevision) {
						layout = savedLayout;
					}
					setPage(project);
				}
			} catch {
				if (loading === request) {
					setPage(undefined, true);
				}
			} finally {
				if (loading === request) {
					loading = undefined;
					request.dispose();
				}
			}
		};

		const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, `{${configPath},${legacyConfigPath}}`));
		const listeners = vscode.Disposable.from(
			watcher,
			watcher.onDidCreate(() => void refresh()),
			watcher.onDidChange(() => void refresh()),
			watcher.onDidDelete(() => void refresh()),
			panel.onDidChangeViewState(event => {
				if (event.webviewPanel.visible) {
					void refresh();
				}
			}),
			panel.webview.onDidReceiveMessage(async (message: unknown) => {
				if (message === 'restore-task-notes') {
					const editor = notesEditor;
					void panel.webview.postMessage(editor
						? { type: 'open-task-notes', title: editor.action.title, notes: editor.action.notes, saving: editor.saving, restore: true }
						: { type: 'clear-task-notes-draft' });
					return;
				}
				if (notesEditor) {
					const editor = notesEditor;
					if (editor.saving) {
						return;
					}
					if (message === 'cancel-task-notes') {
						notesEditor = undefined;
						void refresh();
					} else if (message && typeof message === 'object' && 'type' in message && message.type === 'save-task-notes'
						&& 'notes' in message && typeof message.notes === 'string') {
						editor.saving = true;
						try {
							const { index, milestone } = editor.action;
							await editProjectTasks(folder.uri, editor.revision, { type: 'set-task-notes', index, milestone, notes: message.notes });
							notesEditor = undefined;
							if (panels.get(key) === panel) {
								void refresh();
							}
						} catch (error) {
							editor.saving = false;
							const reason = error instanceof ProjectDetailsError ? error.message
								: vscode.l10n.t("Check that {0} is writable and try again.", configPath);
							void panel.webview.postMessage({ type: 'task-notes-save-failed', message: reason });
						}
					}
					return;
				}
				if (Array.isArray(message)) {
					const nextLayout = resolveLayout(components, message);
					layout = nextLayout;
					layoutRevision++;
					const save = (pendingSaves.get(key) ?? Promise.resolve()).then(() => saveLayout(folder.uri, nextLayout)).catch(() => {
						void vscode.window.showWarningMessage(vscode.l10n.t("The project layout could not be saved."));
					});
					pendingSaves.set(key, save);
					await save;
					if (pendingSaves.get(key) === save) {
						pendingSaves.delete(key);
					}
					return;
				}
				const action = typeof message === 'string' ? actions.get(message) : undefined;
				if (!action) {
					return;
				}
				if (!(action instanceof vscode.Uri) && (action === 'add-link' || !('external' in action))) {
					const project = renderedProject;
					if (!project || editingDetails.has(key)) {
						return;
					}
					if (action !== 'add-link' && action.type === 'edit-task-notes') {
						const editor = { action, revision: project.taskRevision, saving: false };
						notesEditor = editor;
						if (!await panel.webview.postMessage({ type: 'open-task-notes', title: action.title, notes: action.notes }) && notesEditor === editor) {
							notesEditor = undefined;
						}
						return;
					}
					editingDetails.add(key);
					try {
						if (action === 'add-link') {
							const link = await promptForLink(folder.uri);
							if (!link || panels.get(key) !== panel) {
								return;
							}
							await appendProjectLink(folder.uri, link);
						} else {
							const edit = await promptForTaskEdit(action, project);
							if (!edit || panels.get(key) !== panel) {
								return;
							}
							await editProjectTasks(folder.uri, project.taskRevision, edit);
						}
					} catch {
						void vscode.window.showWarningMessage(action === 'add-link'
							? vscode.l10n.t("The quick link could not be saved. Check the project details in {0}.", configPath)
							: vscode.l10n.t("The task update could not be saved. Check the project details in {0} and try again.", configPath));
					} finally {
						editingDetails.delete(key);
					}
					if (panels.get(key) === panel) {
						void refresh();
					}
					return;
				}
				try {
					if (action instanceof vscode.Uri) {
						const info = await vscode.workspace.fs.stat(action);
						const command = info.type & vscode.FileType.Directory ? 'revealInExplorer' : 'vscode.open';
						await vscode.commands.executeCommand(command, action);
					} else if (!await vscode.env.openExternal(action.external)) {
						throw new Error('The external link could not be opened');
					}
				} catch {
					void vscode.window.showWarningMessage(vscode.l10n.t("The selected project resource could not be opened."));
				}
			}),
		);
		panel.onDidDispose(() => {
			loading?.cancel();
			loading?.dispose();
			loading = undefined;
			listeners.dispose();
			panels.delete(key);
		});
		setPage();
		void refresh();
	};

	const updateActionBar = () => vscode.commands.executeCommand(
		'setContext', 'positronTopActionBarCommandCenterVisible', !vscode.workspace.workspaceFolders?.length);

	context.subscriptions.push(
		vscode.commands.registerCommand('positron.projectHome.open', async () => {
			const folders = vscode.workspace.workspaceFolders;
			if (!folders?.length) {
				return;
			}
			const folder = folders.length === 1 ? folders[0] : (await vscode.window.showQuickPick(
				folders.map(folder => ({ label: folder.name, description: folder.uri.path, folder })),
				{ placeHolder: vscode.l10n.t("Select a project to open") },
			))?.folder;
			if (!folder || !vscode.workspace.workspaceFolders?.some(candidate => candidate.uri.toString() === folder.uri.toString())) {
				return;
			}
			const panel = panels.get(folder.uri.toString());
			if (panel) {
				panel.reveal();
			} else {
				bindPanel(folder, vscode.window.createWebviewPanel(viewType, folder.name, vscode.ViewColumn.Active, options(folder)));
			}
		}),
		vscode.window.registerWebviewPanelSerializer(viewType, {
			async deserializeWebviewPanel(panel, state: { folder?: string } | undefined) {
				const folder = vscode.workspace.workspaceFolders?.find(folder => folder.uri.toString() === state?.folder);
				if (folder && !panels.has(folder.uri.toString())) {
					bindPanel(folder, panel);
				} else {
					panel.dispose();
				}
			},
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(event => {
			for (const folder of event.removed) {
				panels.get(folder.uri.toString())?.dispose();
			}
			void updateActionBar();
		}),
		new vscode.Disposable(() => {
			for (const panel of panels.values()) {
				panel.dispose();
			}
			void vscode.commands.executeCommand('setContext', 'positronTopActionBarCommandCenterVisible', true);
		}),
	);
	void updateActionBar();
}

