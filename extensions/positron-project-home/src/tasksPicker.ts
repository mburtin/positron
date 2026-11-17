/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { formatDay, relativeDue } from './components/details';
import { openTaskGroups, openTaskSummary, parseDueDate, toDayString } from './deadlines';
import { editProjectTasks, loadProjectTasks, ProjectDetailsError, ProjectTask, TaskEdit } from './project';
import { configPath, legacyConfigPath } from './settings';

/** Context key holding the number of open tasks, shown as a badge on the Tasks button. */
const openTaskCountKey = 'positronProjectHome.openTaskCount';
/** Context key set when an open task is overdue, which shows the badge with warning colors. */
const hasOverdueTasksKey = 'positronProjectHome.hasOverdueTasks';

/** Prompts for the title of a new task. */
export async function promptForNewTask(): Promise<TaskEdit | undefined> {
	const title = (await vscode.window.showInputBox({
		title: vscode.l10n.t("Add Task"),
		prompt: vscode.l10n.t("Enter a title"),
		validateInput: value => value.trim() ? undefined : vscode.l10n.t("Enter a title."),
	}))?.trim();
	return title ? { type: 'add-task', title } : undefined;
}

/**
 * Keeps the open task count and the overdue flag of all workspace folders in context keys. The
 * count is refreshed when a project details file changes, when the workspace folders change, and
 * when the window gains focus, so that tasks become overdue when the day changes.
 */
export function registerTaskCounter(): vscode.Disposable {
	let disposed = false;
	let generation = 0;
	const update = async () => {
		const run = ++generation;
		const today = toDayString(new Date());
		const summaries = await Promise.all((vscode.workspace.workspaceFolders ?? []).map(async folder => {
			try {
				return openTaskSummary((await loadProjectTasks(folder.uri)).tasks, today);
			} catch {
				return { count: 0, overdue: false };
			}
		}));
		if (disposed || run !== generation) {
			return;
		}
		const count = summaries.reduce((total, summary) => total + summary.count, 0);
		const overdue = summaries.some(summary => summary.overdue);
		await vscode.commands.executeCommand('setContext', openTaskCountKey, count);
		await vscode.commands.executeCommand('setContext', hasOverdueTasksKey, overdue);
	};

	const watcher = vscode.workspace.createFileSystemWatcher(`**/{${configPath},${legacyConfigPath}}`);
	const disposable = vscode.Disposable.from(
		watcher,
		watcher.onDidCreate(() => void update()),
		watcher.onDidChange(() => void update()),
		watcher.onDidDelete(() => void update()),
		vscode.workspace.onDidChangeWorkspaceFolders(() => void update()),
		vscode.window.onDidChangeWindowState(state => {
			if (state.focused) {
				void update();
			}
		}),
	);
	void update();
	return new vscode.Disposable(() => {
		disposed = true;
		disposable.dispose();
	});
}

interface TaskItem extends vscode.QuickPickItem {
	readonly task?: ProjectTask;
	readonly add?: true;
}

/** Shows the first non-empty line of the notes of a task. */
function notesPreview(notes: string | undefined): string | undefined {
	return notes?.split('\n').map(line => line.trim()).find(line => line);
}

/**
 * Lists the open tasks of a project, grouped by how soon they are due. Selecting a task marks it as
 * done; the list stays open so that several tasks can be completed in a row.
 */
export async function showTasksPicker(folder: vscode.WorkspaceFolder): Promise<void> {
	const picker = vscode.window.createQuickPick<TaskItem>();
	const homeButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('home'), tooltip: vscode.l10n.t("Open Project Home") };
	const dueButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('calendar'), tooltip: vscode.l10n.t("Change Due Date") };
	const addItem: TaskItem = { label: `$(add) ${vscode.l10n.t("Add Task...")}`, alwaysShow: true, add: true };
	picker.title = vscode.l10n.t("Open Tasks: {0}", folder.name);
	picker.matchOnDescription = true;
	picker.matchOnDetail = true;
	picker.buttons = [homeButton];

	let revision = '';
	let editing = false;
	let prompting = false;

	const taskItem = (task: ProjectTask, today: string): TaskItem => ({
		label: `$(circle-large-outline) ${task.title}`,
		description: task.due ? `${relativeDue(task.due, today)} - ${formatDay(task.due)}` : task.tag,
		detail: notesPreview(task.notes),
		buttons: [dueButton],
		task,
	});

	const load = async () => {
		picker.busy = true;
		try {
			const { tasks, taskRevision } = await loadProjectTasks(folder.uri);
			const today = toDayString(new Date());
			const groups = openTaskGroups(tasks, today);
			const sections = [
				{ label: vscode.l10n.t("Overdue"), tasks: groups.overdue },
				{ label: vscode.l10n.t("Next 7 Days"), tasks: groups.upcoming },
				{ label: vscode.l10n.t("Later"), tasks: groups.later },
				{ label: vscode.l10n.t("No Due Date"), tasks: groups.undated },
			];
			revision = taskRevision;
			picker.items = [addItem, ...sections.filter(section => section.tasks.length).flatMap(section => [
				{ label: section.label, kind: vscode.QuickPickItemKind.Separator },
				...section.tasks.map(task => taskItem(task, today)),
			])];
			picker.placeholder = sections.some(section => section.tasks.length)
				? vscode.l10n.t("Select a task to mark it as done")
				: vscode.l10n.t("No open tasks.");
		} catch {
			picker.items = [addItem];
			picker.placeholder = vscode.l10n.t("The tasks could not be loaded. Check the project details in {0}.", configPath);
		} finally {
			picker.busy = false;
		}
	};

	/** Runs an input box over the picker, which hides it, and shows the picker again afterwards. */
	const prompt = async <T>(input: () => Thenable<T>): Promise<T> => {
		prompting = true;
		try {
			return await input();
		} finally {
			prompting = false;
			picker.show();
		}
	};

	const apply = async (edit: TaskEdit | undefined) => {
		if (!edit) {
			return;
		}
		editing = true;
		picker.enabled = false;
		try {
			await editProjectTasks(folder.uri, revision, edit);
		} catch (error) {
			void vscode.window.showWarningMessage(error instanceof ProjectDetailsError ? error.message
				: vscode.l10n.t("The task update could not be saved. Check the project details in {0} and try again.", configPath));
		} finally {
			editing = false;
			picker.enabled = true;
			await load();
		}
	};

	const disposables: vscode.Disposable[] = [
		picker,
		picker.onDidAccept(async () => {
			const [item] = picker.selectedItems;
			if (!item || editing) {
				return;
			}
			if (item.add) {
				await apply(await prompt(promptForNewTask));
			} else if (item.task) {
				await apply({ type: 'set-task-done', index: item.task.index, done: true });
			}
		}),
		picker.onDidTriggerItemButton(async ({ item }) => {
			const task = item.task;
			if (!task || editing) {
				return;
			}
			const due = await prompt(() => vscode.window.showInputBox({
				title: vscode.l10n.t("Due Date"),
				prompt: vscode.l10n.t("Enter a due date for {0} as YYYY-MM-DD, or leave it empty to remove it", task.title),
				placeHolder: 'YYYY-MM-DD',
				value: task.due ?? '',
				validateInput: value => !value.trim() || parseDueDate(value) ? undefined : vscode.l10n.t("Enter a valid due date."),
			}));
			if (due !== undefined) {
				await apply({ type: 'set-task-due', index: task.index, due: due.trim() });
			}
		}),
		picker.onDidTriggerButton(async button => {
			if (button === homeButton) {
				picker.hide();
				await vscode.commands.executeCommand('positron.projectHome.open');
			}
		}),
		picker.onDidHide(() => {
			if (!prompting) {
				vscode.Disposable.from(...disposables).dispose();
			}
		}),
	];

	picker.show();
	await load();
}
