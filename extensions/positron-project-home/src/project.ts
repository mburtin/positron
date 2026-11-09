/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { configPath, createFileIfMissing, encodeSettings, legacyConfigPath, readOptionalFile } from './settings';

const patterns = {
	docs: '{[Rr][Ee][Aa][Dd][Mm][Ee]*,docs/**,documentation/**}',
	manuscript: '{manuscript.*,manuscript/**}',
	data: 'data/**',
	journal: '{journal.*,journal/**}',
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

export interface ProjectConfig {
	title?: string;
	description?: string;
	tags: string[];
	banner?: string;
	tasks: ProjectTask[];
	manuscript?: { file?: string; sections: ChecklistItem[] };
	milestones: ProjectMilestone[];
	links: ProjectLink[];
}

interface ProjectLink {
	label: string;
	target: string;
}

type ConfigState = 'missing' | 'invalid' | 'ready';

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asText(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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

/** Identifies the task data behind the current dashboard actions. */
function taskRevision(raw: Record<string, unknown>): string {
	return JSON.stringify([raw.tasks, raw.milestones]);
}

function parseConfig(raw: Record<string, unknown>): ProjectConfig {
	const manuscript = asRecord(raw.manuscript);
	return {
		title: asText(raw.title),
		description: asText(raw.description),
		tags: Array.isArray(raw.tags) ? raw.tags.flatMap((item: unknown) => asText(item) ?? []) : [],
		banner: asText(raw.banner),
		tasks: readTasks(raw.tasks),
		manuscript: manuscript && {
			file: asText(manuscript.file),
			sections: readItems(manuscript.sections, readChecklistItem),
		},
		milestones: readItems(raw.milestones, (item, index) => {
			const title = asText(item.title);
			return title ? {
				index, title, date: asText(item.date), legacyDone: item.tasks === undefined && item.done === true,
				tasks: readTasks(item.tasks),
			} : undefined;
		}).sort((a, b) => (a.date ?? '\uffff').localeCompare(b.date ?? '\uffff')),
		links: readItems(raw.links, item => {
			const label = asText(item.label);
			const target = asText(item.target);
			return label && target ? { label, target } : undefined;
		}),
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

export function projectResource(folder: vscode.Uri, path: string): vscode.Uri | undefined {
	const segments = path.split('/');
	if (segments.some(segment => !segment || segment === '.' || segment === '..' || /[\\:\u0000-\u001f]/.test(segment))) {
		return undefined;
	}
	return vscode.Uri.joinPath(folder, ...segments);
}

/** Resolves both configured links and targets entered in the dashboard. */
export function resolveLinkTarget(folder: vscode.Uri, target: string): vscode.Uri | { external: vscode.Uri } | undefined {
	if (!/^https:\/\//i.test(target)) {
		return projectResource(folder, target);
	}
	try {
		const url = new URL(target);
		return url.username || url.password ? undefined : { external: vscode.Uri.parse(url.href) };
	} catch {
		return undefined;
	}
}

/** Appends to the current project details, preserving fields outside the dashboard model. */
export async function appendProjectLink(folder: vscode.Uri, link: ProjectLink): Promise<void> {
	await updateProjectDetails(folder, raw => {
		projectItems(raw, 'links').push(link);
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
function projectItems(raw: Record<string, unknown>, key: 'links' | 'milestones' | 'tasks'): unknown[] {
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

export function isImage(uri: vscode.Uri): boolean {
	return /\.(png|jpe?g|gif|webp|avif)$/i.test(uri.path);
}

export async function loadProject(folder: vscode.WorkspaceFolder, token: vscode.CancellationToken) {
	const root = folder.uri.toString();
	const find = async (pattern: string) => {
		const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, pattern), undefined, 50, token);
		return files.filter(uri => vscode.workspace.getWorkspaceFolder(uri)?.uri.toString() === root)
			.sort((a, b) => a.path.localeCompare(b.path));
	};
	const [metadata, docs, manuscript, data, journal] = await Promise.all([
		readConfig(folder.uri),
		find(patterns.docs), find(patterns.manuscript), find(patterns.data), find(patterns.journal),
	]);
	const { config } = metadata;
	const banner = config.banner && projectResource(folder.uri, config.banner);
	const manuscriptFile = config.manuscript?.file && projectResource(folder.uri, config.manuscript.file);
	const [bannerStat, manuscriptStat, links] = await Promise.all([
		banner && isImage(banner) ? stat(banner) : undefined,
		manuscriptFile ? stat(manuscriptFile) : undefined,
		Promise.all(config.links.map(async link => {
			const target = resolveLinkTarget(folder.uri, link.target);
			const info = target instanceof vscode.Uri ? await stat(target) : undefined;
			return { label: link.label, target, isDirectory: !!(info && (info.type & vscode.FileType.Directory)) };
		})),
	]);
	return {
		...metadata,
		links,
		banner: banner && bannerStat?.type === vscode.FileType.File ? banner : undefined,
		files: {
			docs, manuscript: manuscriptFile && manuscriptStat && (manuscriptStat.type & vscode.FileType.File) ? [manuscriptFile, ...manuscript.filter(uri => uri.toString() !== manuscriptFile.toString())] : manuscript,
			data, journal,
		},
	};
}

export type Project = Awaited<ReturnType<typeof loadProject>>;
