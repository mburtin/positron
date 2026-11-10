/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { loadManuscript, manuscriptDirectory } from './manuscript';
import { asRecord, asText, configPath, createFileIfMissing, encodeSettings, legacyConfigPath, projectResource, readOptionalFile } from './settings';

const patterns = {
	manuscript: `{${manuscriptDirectory}.*,${manuscriptDirectory}/**}`,
	data: 'data/**',
};

export interface ChecklistItem {
	title: string;
	done: boolean;
	tag?: string;
}

export interface ProjectTask extends ChecklistItem {
	index: number;
	notes?: string;
}

export interface ProjectMilestone {
	index: number;
	title: string;
	date?: string;
	/** Completion recorded before milestones supported tasks. */
	legacyDone: boolean;
	tasks: ProjectTask[];
}

interface ProjectConfig {
	title?: string;
	tasks: ProjectTask[];
	manuscript?: { file?: string; sections: ChecklistItem[]; completedChapters: string[] };
	milestones: ProjectMilestone[];
	links: ProjectShortcut[];
	documents: ProjectShortcut[];
	data: ProjectShortcut[];
}

export interface ProjectShortcut {
	label: string;
	target: string;
}

export type FileShortcutSection = 'documents' | 'data';

type ShortcutSection = 'links' | FileShortcutSection;

type ConfigState = 'missing' | 'invalid' | 'ready';

function readChapterPaths(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((path): path is string => typeof path === 'string') : [];
}

function readItems<T>(value: unknown, read: (item: Record<string, unknown>, index: number) => T | undefined): T[] {
	return Array.isArray(value) ? value.flatMap((entry: unknown, index) => {
		const item = asRecord(entry);
		const result = item && read(item, index);
		return result === undefined ? [] : [result];
	}) : [];
}

function readChecklistItem(item: Record<string, unknown>): ChecklistItem | undefined {
	const title = asText(item.title);
	return title ? { title, done: item.done === true, tag: asText(item.tag) } : undefined;
}

function readTasks(value: unknown): ProjectTask[] {
	return readItems(value, (item, index) => {
		const task = readChecklistItem(item);
		const notes = typeof item.notes === 'string' ? item.notes : undefined;
		return task && { ...task, index, notes };
	});
}

function readShortcuts(value: unknown, trimTarget = false): ProjectShortcut[] {
	return readItems(value, item => {
		const label = asText(item.label);
		const target = item.target;
		return label && typeof target === 'string' && target.trim()
			? { label, target: trimTarget ? target.trim() : target } : undefined;
	});
}

/** Identifies the task data behind the current dashboard actions. */
function taskRevision(raw: Record<string, unknown>): string {
	return JSON.stringify([raw.tasks, raw.milestones]);
}

function parseConfig(raw: Record<string, unknown>): ProjectConfig {
	const manuscript = asRecord(raw.manuscript);
	return {
		title: asText(raw.title),
		tasks: readTasks(raw.tasks),
		manuscript: manuscript && {
			file: asText(manuscript.file),
			sections: readItems(manuscript.sections, readChecklistItem),
			completedChapters: readChapterPaths(manuscript.completedChapters),
		},
		milestones: readItems(raw.milestones, (item, index) => {
			const title = asText(item.title);
			return title ? {
				index, title, date: asText(item.date), legacyDone: item.tasks === undefined && item.done === true,
				tasks: readTasks(item.tasks),
			} : undefined;
		}).sort((a, b) => (a.date ?? '\uffff').localeCompare(b.date ?? '\uffff')),
		links: readShortcuts(raw.links, true),
		documents: readShortcuts(raw.documents),
		data: readShortcuts(raw.data),
	};
}

async function readConfig(folder: vscode.Uri): Promise<{ state: ConfigState; config: ProjectConfig; taskRevision: string }> {
	const result = (state: ConfigState, raw = {}) => ({ state, config: parseConfig(raw), taskRevision: taskRevision(raw) });
	const uri = vscode.Uri.joinPath(folder, configPath);
	try {
		const current = await readOptionalFile(uri);
		const bytes = current ?? await readOptionalFile(vscode.Uri.joinPath(folder, legacyConfigPath));
		if (!bytes) {
			return result('missing');
		}
		const decoder = new TextDecoder();
		let raw = asRecord(JSON.parse(decoder.decode(bytes)));
		if (!current && raw) {
			try {
				await createFileIfMissing(uri, bytes);
			} catch {
				// Read-only projects can continue using their legacy settings.
			}
			const saved = await readOptionalFile(uri);
			if (saved) {
				raw = asRecord(JSON.parse(decoder.decode(saved)));
			}
		}
		return result(raw ? 'ready' : 'invalid', raw);
	} catch {
		return result('invalid');
	}
}

/** Accepts HTTPS links without credentials. */
export function resolveLinkTarget(target: string): vscode.Uri | undefined {
	if (!/^https:\/\//i.test(target)) {
		return undefined;
	}
	try {
		const url = new URL(target);
		return url.username || url.password ? undefined : vscode.Uri.parse(url.href);
	} catch {
		return undefined;
	}
}

/** Appends a shortcut to the current project details. */
export async function appendProjectShortcut(folder: vscode.Uri, key: ShortcutSection, shortcut: ProjectShortcut): Promise<void> {
	if (key !== 'links' && !projectResource(folder, shortcut.target)) {
		throw new ProjectDetailsError(vscode.l10n.t("Select a file inside the project folder."));
	}
	await updateProjectDetails(folder, raw => {
		const items = projectItems(raw, key);
		if (key === 'links' || !readShortcuts(items).some(item => item.target === shortcut.target)) {
			items.push(shortcut);
		}
	});
}

/** Removes a pin, including a legacy local shortcut displayed in Documentation. */
export async function removeProjectFileShortcut(folder: vscode.Uri, section: FileShortcutSection, target: string): Promise<void> {
	await updateProjectDetails(folder, raw => {
		if (Array.isArray(raw[section])) {
			raw[section] = raw[section].filter(item => asRecord(item)?.target !== target);
		}
		if (section === 'documents' && Array.isArray(raw.links)) {
			raw.links = raw.links.filter(item => asText(asRecord(item)?.target) !== target);
		}
	});
}

export type TaskEdit =
	| { type: 'add-milestone'; title: string }
	| { type: 'add-task'; title: string; milestone?: number }
	| { type: 'set-task-done'; index: number; milestone?: number; done: boolean }
	| { type: 'set-task-notes'; index: number; milestone?: number; notes: string }
	| { type: 'move-task'; index: number; milestone?: number; destination?: number };

/** Provides a localized explanation when project details cannot be updated safely. */
export class ProjectDetailsError extends Error { }

/** Persists the completion state of a chapter without editing its Quarto source. */
export async function setManuscriptChapterDone(folder: vscode.Uri, path: string, done: boolean): Promise<void> {
	await updateProjectDetails(folder, raw => {
		const manuscript = raw.manuscript === undefined ? raw.manuscript = {} : asRecord(raw.manuscript);
		if (!manuscript || (manuscript.completedChapters !== undefined && !Array.isArray(manuscript.completedChapters))) {
			throw new Error('Invalid manuscript details');
		}
		const completed = new Set(readChapterPaths(manuscript.completedChapters));
		if (done) {
			completed.add(path);
		} else {
			completed.delete(path);
		}
		manuscript.completedChapters = [...completed];
	});
}

/** Applies an edit only if the task lists still match the rendered dashboard. */
export async function editProjectTasks(folder: vscode.Uri, revision: string, edit: TaskEdit): Promise<void> {
	await updateProjectDetails(folder, raw => {
		if (taskRevision(raw) !== revision) {
			throw new ProjectDetailsError(vscode.l10n.t("The task list changed. Reopen the notes to load the latest task data."));
		}
		if (edit.type === 'add-milestone') {
			projectItems(raw, 'milestones').push({ title: edit.title, tasks: [] });
			return;
		}
		const tasks = (milestone: number | undefined) => {
			const owner = milestone === undefined ? raw : asRecord(projectItems(raw, 'milestones')[milestone]);
			if (!owner) {
				throw new Error('Invalid milestone');
			}
			return projectItems(owner, 'tasks');
		};
		const items = tasks(edit.milestone);
		if (edit.type === 'add-task') {
			items.push({ title: edit.title, done: false });
			return;
		}
		const task = asRecord(items[edit.index]);
		if (!task) {
			throw new Error('Invalid task');
		}
		if (edit.type === 'set-task-done') {
			task.done = edit.done;
		} else if (edit.type === 'set-task-notes') {
			if (edit.notes.trim()) {
				task.notes = edit.notes;
			} else {
				delete task.notes;
			}
		} else if (edit.milestone !== edit.destination) {
			tasks(edit.destination).push(task);
			items.splice(edit.index, 1);
		}
	});
}

/** Gets an editable list without discarding malformed project data. */
function projectItems(raw: Record<string, unknown>, key: ShortcutSection | 'milestones' | 'tasks'): unknown[] {
	const value = raw[key] === undefined ? raw[key] = [] : raw[key];
	if (!Array.isArray(value)) {
		throw new Error('Invalid project details');
	}
	return value;
}

/** Applies a project details edit while preserving fields outside the dashboard model. */
async function updateProjectDetails(folder: vscode.Uri, update: (raw: Record<string, unknown>) => void): Promise<void> {
	const uri = vscode.Uri.joinPath(folder, configPath);
	const current = await readOptionalFile(uri);
	const document = current && await vscode.workspace.openTextDocument(uri);
	// Use the same persisted data as the dashboard, even if the editor's clean model differs.
	const bytes = document ? await vscode.workspace.fs.readFile(uri)
		: await readOptionalFile(vscode.Uri.joinPath(folder, legacyConfigPath));
	if (document?.isDirty) {
		throw new ProjectDetailsError(vscode.l10n.t("Save or revert the unsaved changes in {0}, then try again.", configPath));
	}
	if (document?.isClosed) {
		throw new ProjectDetailsError(vscode.l10n.t("The project details editor was closed. Try saving again."));
	}
	const source = bytes ? new TextDecoder().decode(bytes) : '{}';
	let raw: Record<string, unknown> | undefined;
	try {
		raw = asRecord(JSON.parse(source));
	} catch {
		// Report invalid JSON with the same guidance as an invalid root object.
	}
	if (!raw) {
		throw new ProjectDetailsError(vscode.l10n.t("Check the JSON in {0}, then try again.", configPath));
	}
	const before = JSON.stringify(raw);
	update(raw);
	if (JSON.stringify(raw) === before) {
		return;
	}
	const updated = encodeSettings(raw);
	const edit = new vscode.WorkspaceEdit();
	if (document) {
		edit.replace(uri, new vscode.Range(0, 0, document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length),
			new TextDecoder().decode(updated));
	} else {
		edit.createFile(uri, { contents: updated });
	}
	if (!await vscode.workspace.applyEdit(edit)) {
		throw new ProjectDetailsError(vscode.l10n.t("The edit could not be applied to {0}. Check that the file is writable and try again.", configPath));
	}
	if (document && !await document.save()) {
		throw new ProjectDetailsError(vscode.l10n.t("The editor could not save {0}. Check the file for a save conflict or write error.", configPath));
	}
}

async function stat(uri: vscode.Uri): Promise<vscode.FileStat | undefined> {
	try {
		return await vscode.workspace.fs.stat(uri);
	} catch {
		return undefined;
	}
}

/** Resolves pinned files in display order and keeps each target only once. */
async function loadFileShortcuts(folder: vscode.Uri, shortcuts: ProjectShortcut[]) {
	const targets = new Set<string>();
	const files = await Promise.all(shortcuts.map(async ({ label, target }) => {
		const uri = projectResource(folder, target);
		if (!uri || targets.has(target)) {
			return undefined;
		}
		targets.add(target);
		const info = await stat(uri);
		return info && (info.type & vscode.FileType.Directory) ? undefined : { label, target, uri };
	}));
	return files.filter(file => file !== undefined);
}

export async function loadProject(folder: vscode.WorkspaceFolder, token: vscode.CancellationToken) {
	const root = folder.uri.toString();
	const find = async (pattern: string) => {
		const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, pattern), undefined, 50, token);
		return files.filter(uri => vscode.workspace.getWorkspaceFolder(uri)?.uri.toString() === root)
			.sort((a, b) => a.path.localeCompare(b.path));
	};
	const [metadata, manuscript, data, manuscriptBook] = await Promise.all([
		readConfig(folder.uri),
		find(patterns.manuscript), find(patterns.data),
		loadManuscript(folder.uri),
	]);
	const { config } = metadata;
	const manuscriptFile = config.manuscript?.file && projectResource(folder.uri, config.manuscript.file);
	const links = config.links.flatMap(({ label, target }) => {
		const external = resolveLinkTarget(target);
		return external ? [{ label, external }] : [];
	});
	// Older projects stored local shortcuts alongside external links.
	const manuscriptFolder = vscode.Uri.joinPath(folder.uri, manuscriptDirectory);
	const [manuscriptStat, manuscriptFolderStat, documents, dataPins] = await Promise.all([
		manuscriptFile ? stat(manuscriptFile) : undefined,
		manuscriptBook ? undefined : stat(manuscriptFolder),
		loadFileShortcuts(folder.uri, [...config.documents, ...config.links]),
		loadFileShortcuts(folder.uri, config.data),
	]);
	const pinnedDataUris = new Set(dataPins.map(({ uri }) => uri.toString()));
	const rootLength = folder.uri.path.replace(/\/$/, '').length + 1;
	const detectedData = data.filter(uri => !pinnedDataUris.has(uri.toString())).map(uri => {
		const target = uri.path.slice(rootLength);
		return { uri, target, label: target.slice(target.lastIndexOf('/') + 1), pinned: false };
	});
	return {
		...metadata,
		manuscriptBook,
		manuscriptFolder: manuscriptFolderStat ? manuscriptFolder : undefined,
		links,
		documents,
		data: [...dataPins.map(file => ({ ...file, pinned: true })), ...detectedData],
		files: {
			manuscript: manuscriptFile && manuscriptStat && (manuscriptStat.type & vscode.FileType.File) ? [manuscriptFile, ...manuscript.filter(uri => uri.toString() !== manuscriptFile.toString())] : manuscript,
		},
	};
}

export type Project = Awaited<ReturnType<typeof loadProject>>;
