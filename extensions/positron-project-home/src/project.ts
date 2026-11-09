/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { configPath, createFileIfMissing, legacyConfigPath, readOptionalFile } from './settings';

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

export interface ProjectConfig {
	title?: string;
	description?: string;
	tags: string[];
	banner?: string;
	tasks: ChecklistItem[];
	manuscript?: { file?: string; sections: ChecklistItem[] };
	milestones: { title: string; date: string; done: boolean }[];
	links: { label: string; target: string }[];
}

type ConfigState = 'missing' | 'invalid' | 'ready';

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asText(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readItems<T>(value: unknown, read: (item: Record<string, unknown>) => T | undefined): T[] {
	return Array.isArray(value) ? value.flatMap((entry: unknown) => {
		const item = asRecord(entry);
		const result = item && read(item);
		return result === undefined ? [] : [result];
	}) : [];
}

function readChecklist(value: unknown): ChecklistItem[] {
	return readItems(value, item => {
		const title = asText(item.title);
		return title ? { title, done: item.done === true, tag: asText(item.tag) } : undefined;
	});
}

function parseConfig(raw: Record<string, unknown>): ProjectConfig {
	const manuscript = asRecord(raw.manuscript);
	return {
		title: asText(raw.title),
		description: asText(raw.description),
		tags: Array.isArray(raw.tags) ? raw.tags.flatMap((item: unknown) => asText(item) ?? []) : [],
		banner: asText(raw.banner),
		tasks: readChecklist(raw.tasks),
		manuscript: manuscript && {
			file: asText(manuscript.file),
			sections: readChecklist(manuscript.sections),
		},
		milestones: readItems(raw.milestones, item => {
			const title = asText(item.title);
			const date = asText(item.date);
			return title && date ? { title, date, done: item.done === true } : undefined;
		}).sort((a, b) => a.date.localeCompare(b.date)),
		links: readItems(raw.links, item => {
			const label = asText(item.label);
			const target = asText(item.target);
			return label && target ? { label, target } : undefined;
		}),
	};
}

async function readConfig(folder: vscode.Uri): Promise<{ state: ConfigState; config: ProjectConfig }> {
	const uri = vscode.Uri.joinPath(folder, configPath);
	try {
		const current = await readOptionalFile(uri);
		const bytes = current ?? await readOptionalFile(vscode.Uri.joinPath(folder, legacyConfigPath));
		if (!bytes) {
			return { state: 'missing', config: parseConfig({}) };
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
		return { state: raw ? 'ready' : 'invalid', config: parseConfig(raw ?? {}) };
	} catch {
		return { state: 'invalid', config: parseConfig({}) };
	}
}

export function projectResource(folder: vscode.Uri, path: string): vscode.Uri | undefined {
	const segments = path.split('/');
	if (segments.some(segment => !segment || segment === '.' || segment === '..' || /[\\:\u0000-\u001f]/.test(segment))) {
		return undefined;
	}
	return vscode.Uri.joinPath(folder, ...segments);
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
	const [bannerStat, manuscriptStat] = await Promise.all([
		banner && isImage(banner) ? stat(banner) : undefined,
		manuscriptFile ? stat(manuscriptFile) : undefined,
	]);
	return {
		...metadata,
		banner: banner && bannerStat?.type === vscode.FileType.File ? banner : undefined,
		files: {
			docs, manuscript: manuscriptFile && manuscriptStat && (manuscriptStat.type & vscode.FileType.File) ? [manuscriptFile, ...manuscript.filter(uri => uri.toString() !== manuscriptFile.toString())] : manuscript,
			data, journal,
		},
	};
}

export type Project = Awaited<ReturnType<typeof loadProject>>;
