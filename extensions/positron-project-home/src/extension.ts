/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ProjectAction, TaskAction, TaskDialogAction } from './components/component';
import { createComponents } from './components/registry';
import { renderDashboard } from './dashboard';
import { loadLayout, resolveLayout, saveLayout } from './layout';
import { createManuscript, manuscriptWatchPaths } from './manuscript';
import { appendProjectShortcut, editProjectTasks, FileShortcutSection, loadProject, Project, ProjectDetailsError, removeProjectFileShortcut, resolveLinkTarget, setManuscriptChapterDone, TaskEdit } from './project';
import { configPath, legacyConfigPath, projectResource } from './settings';

const viewType = 'positron.projectHome';
const clientRoot = vscode.Uri.file(__dirname);

/** Collects the label and target using the workbench's input controls. */
async function promptForLink() {
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
		prompt: vscode.l10n.t("Enter an HTTPS URL"),
		placeHolder: 'https://…',
		validateInput: value => resolveLinkTarget(value.trim()) ? undefined
			: vscode.l10n.t("Enter a valid HTTPS URL without credentials."),
	});
	return target === undefined ? undefined : { label: label.trim(), target: target.trim() };
}

/** Selects a file that can be stored as a project-relative shortcut. */
async function pickProjectFile(folder: vscode.Uri, section: FileShortcutSection) {
	const title = section === 'documents' ? vscode.l10n.t("Pin Document") : vscode.l10n.t("Pin Data File");
	const [uri] = await vscode.window.showOpenDialog({
		title,
		openLabel: title,
		defaultUri: folder,
		canSelectFiles: true,
		canSelectFolders: false,
	}) ?? [];
	if (!uri) {
		return undefined;
	}
	const prefix = folder.path.replace(/\/$/, '') + '/';
	const target = uri.path.startsWith(prefix) ? uri.path.slice(prefix.length) : '';
	if (projectResource(folder, target)?.toString() !== uri.toString()) {
		throw new ProjectDetailsError(vscode.l10n.t("Select a file inside the project folder."));
	}
	return { label: target.slice(target.lastIndexOf('/') + 1), target };
}

/** Collects any input needed for a task action before opening the project details for writing. */
async function promptForTaskEdit(action: Exclude<TaskAction, TaskDialogAction>): Promise<TaskEdit | undefined> {
	if (action.type === 'set-task-done') {
		return action;
	}
	const title = (await vscode.window.showInputBox({
		title: vscode.l10n.t("Add Task"),
		prompt: vscode.l10n.t("Enter a title"),
		validateInput: value => value.trim() ? undefined : vscode.l10n.t("Enter a title."),
	}))?.trim();
	return title ? { type: 'add-task', title } : undefined;
}

/** Describes the dialog that edits a task, as the dashboard expects it. */
function dialogMessage({ action }: { action: TaskDialogAction }) {
	if (action.type === 'edit-task-notes') {
		return { type: 'open-task-notes', title: action.title, notes: action.notes };
	}
	return action.type === 'edit-task-due'
		? { type: 'open-task-due', create: false, title: action.title, due: action.due }
		: { type: 'open-task-due', create: true, title: '', due: '' };
}

/** Reads a string property from a message sent by the dashboard. */
function messageText(message: object, key: string): string | undefined {
	const value = (message as Record<string, unknown>)[key];
	return typeof value === 'string' ? value : undefined;
}

export function activate(context: vscode.ExtensionContext): void {
	const panels = new Map<string, vscode.WebviewPanel>();
	const components = createComponents();
	const pendingSaves = new Map<string, Promise<void>>();
	const editingDetails = new Set<string>();

	const options = (folder: vscode.WorkspaceFolder): vscode.WebviewOptions => ({
		enableScripts: true,
		localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media'), clientRoot, folder.uri],
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
		/** The task dialog open in the dashboard. Rendering is paused while it is open so edits are not lost. */
		let taskDialog: { action: TaskDialogAction; revision: string; saving: boolean } | undefined;
		const setPage = (project?: Project, error?: boolean) => {
			if (taskDialog) {
				return;
			}
			const page = renderDashboard(panel.webview, context.extensionUri, clientRoot, folder, components, layout, project, error);
			actions = page.actions;
			renderedProject = project;
			panel.webview.html = page.html;
			if (project) {
				panel.title = vscode.l10n.t("Project: {0}", project.config.title ?? folder.name);
			}
		};
		const refresh = async () => {
			if (taskDialog) {
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

		const watchers = [[configPath, legacyConfigPath], manuscriptWatchPaths].flatMap(paths => {
			const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, `{${paths.join(',')}}`));
			return [
				watcher,
				watcher.onDidCreate(() => void refresh()),
				watcher.onDidChange(() => void refresh()),
				watcher.onDidDelete(() => void refresh()),
			];
		});
		const listeners = vscode.Disposable.from(
			...watchers,
			panel.onDidChangeViewState(event => {
				if (event.webviewPanel.visible) {
					void refresh();
				}
			}),
			panel.webview.onDidReceiveMessage(async (message: unknown) => {
				if (message === 'restore-task-notes' || message === 'restore-task-due') {
					const kind = message === 'restore-task-notes' ? 'notes' : 'due';
					const editor = taskDialog && (taskDialog.action.type === 'edit-task-notes') === (kind === 'notes') ? taskDialog : undefined;
					void panel.webview.postMessage(editor
						? { ...dialogMessage(editor), saving: editor.saving, restore: true }
						: { type: `clear-task-${kind}-draft` });
					return;
				}
				if (taskDialog) {
					const editor = taskDialog;
					if (editor.saving) {
						return;
					}
					const { action } = editor;
					if (message === 'cancel-task-notes' || message === 'cancel-task-due') {
						taskDialog = undefined;
						void refresh();
					} else if (message && typeof message === 'object') {
						let edit: TaskEdit | undefined;
						const saved = messageText(message, 'type');
						const notes = messageText(message, 'notes');
						if (saved === 'save-task-notes' && action.type === 'edit-task-notes' && notes !== undefined) {
							edit = { type: 'set-task-notes', index: action.index, notes };
						} else if (saved === 'save-task-due' && action.type === 'edit-task-due') {
							edit = { type: 'set-task-due', index: action.index, due: messageText(message, 'due') ?? '' };
						} else if (saved === 'save-task-due' && action.type === 'add-deadline') {
							const title = messageText(message, 'title')?.trim();
							const due = messageText(message, 'due')?.trim();
							if (!title || !due) {
								void panel.webview.postMessage({ type: 'task-due-save-failed', message: vscode.l10n.t("Enter a title and a due date.") });
								return;
							}
							edit = { type: 'add-task', title, due };
						}
						if (!edit) {
							return;
						}
						editor.saving = true;
						try {
							await editProjectTasks(folder.uri, editor.revision, edit);
							taskDialog = undefined;
							if (panels.get(key) === panel) {
								void refresh();
							}
						} catch (error) {
							editor.saving = false;
							const reason = error instanceof ProjectDetailsError ? error.message
								: vscode.l10n.t("Check that {0} is writable and try again.", configPath);
							void panel.webview.postMessage({ type: action.type === 'edit-task-notes' ? 'task-notes-save-failed' : 'task-due-save-failed', message: reason });
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
				if (!(action instanceof vscode.Uri) && (typeof action === 'string' || action.type !== 'open-link')) {
					const project = renderedProject;
					if (!project || editingDetails.has(key)) {
						return;
					}
					if (typeof action !== 'string' && (action.type === 'edit-task-notes' || action.type === 'edit-task-due' || action.type === 'add-deadline')) {
						const editor = { action, revision: project.taskRevision, saving: false };
						taskDialog = editor;
						if (!await panel.webview.postMessage(dialogMessage(editor)) && taskDialog === editor) {
							taskDialog = undefined;
						}
						return;
					}
					editingDetails.add(key);
					try {
						if (action === 'add-link' || action.type === 'add-file') {
							const shortcut = action === 'add-link' ? await promptForLink() : await pickProjectFile(folder.uri, action.section);
							if (!shortcut || panels.get(key) !== panel) {
								return;
							}
							await appendProjectShortcut(folder.uri, action === 'add-link' ? 'links' : action.section, shortcut);
						} else if (action.type === 'set-file-pinned') {
							if (action.pinned) {
								await appendProjectShortcut(folder.uri, action.section, action.shortcut);
							} else {
								await removeProjectFileShortcut(folder.uri, action.section, action.shortcut.target);
							}
						} else if (action.type === 'create-manuscript') {
							await createManuscript(folder.uri, project.config.title ?? folder.name);
						} else if (action.type === 'set-manuscript-chapter-done') {
							await setManuscriptChapterDone(folder.uri, action.path, action.done);
						} else {
							const edit = await promptForTaskEdit(action);
							if (!edit || panels.get(key) !== panel) {
								return;
							}
							await editProjectTasks(folder.uri, project.taskRevision, edit);
						}
					} catch (error) {
						const projectDetailsAction = action === 'add-link' || action.type === 'add-file'
							|| action.type === 'set-file-pinned' || action.type === 'set-manuscript-chapter-done';
						let message: string;
						if (projectDetailsAction && error instanceof ProjectDetailsError) {
							message = error.message;
						} else if (action === 'add-link') {
							message = vscode.l10n.t("The quick link could not be saved. Check the project details in {0}.", configPath);
						} else if (action.type === 'create-manuscript') {
							message = vscode.l10n.t("The manuscript could not be created. Check that the project folder is writable and that no manuscript folder already exists.");
						} else if (action.type === 'set-manuscript-chapter-done') {
							message = vscode.l10n.t("Manuscript progress could not be saved. Check the project details in {0}.", configPath);
						} else if (action.type === 'add-file' || action.type === 'set-file-pinned') {
							message = vscode.l10n.t("The file pin could not be updated. Check the project details in {0}.", configPath);
						} else {
							message = vscode.l10n.t("The task update could not be saved. Check the project details in {0} and try again.", configPath);
						}
						void vscode.window.showWarningMessage(message);
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
					} else if (vscode.env.uiKind === vscode.UIKind.Desktop) {
						await vscode.commands.executeCommand('workbench.action.browser.open', action.url);
					} else if (!await vscode.env.openExternal(vscode.Uri.parse(action.url))) {
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

	context.subscriptions.push(
		vscode.commands.registerCommand('positron.projectHome.open', async () => {
			const folders = vscode.workspace.workspaceFolders;
			if (!folders?.length) {
				await vscode.commands.executeCommand('workbench.action.files.openFolder');
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
		}),
		new vscode.Disposable(() => {
			for (const panel of panels.values()) {
				panel.dispose();
			}
		}),
	);
}

