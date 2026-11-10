/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JSON_SCHEMA, load } from 'js-yaml';
import * as vscode from 'vscode';
import { asRecord, asText, projectResource, readOptionalFile } from './settings';

export const manuscriptDirectory = 'manuscript';

const configNames = ['_quarto.yml', '_quarto.yaml'];
export const manuscriptWatchPaths = [
	manuscriptDirectory,
	`${manuscriptDirectory}.*`,
	`${manuscriptDirectory}/**/*.qmd`,
	`${manuscriptDirectory}/**/*.md`,
	...configNames.map(name => `${manuscriptDirectory}/${name}`),
];

/** Creates a complete book in a staging directory before publishing it at the project root. */
export async function createManuscript(folder: vscode.Uri, title: string): Promise<void> {
	const chapters = [
		{ path: 'index.qmd', title: vscode.l10n.t("Abstract"), unnumbered: true },
		{ path: 'introduction.qmd', title: vscode.l10n.t("Introduction") },
		{ path: 'methods.qmd', title: vscode.l10n.t("Methods") },
		{ path: 'results.qmd', title: vscode.l10n.t("Results") },
		{ path: 'discussion.qmd', title: vscode.l10n.t("Discussion") },
		{ path: 'conclusion.qmd', title: vscode.l10n.t("Conclusion") },
	];
	const config = [
		'project:',
		'  type: book',
		'',
		'book:',
		`  title: ${JSON.stringify(title)}`,
		`  author: ${JSON.stringify(vscode.l10n.t("Author Name"))}`,
		'  chapters:',
		...chapters.map(chapter => `    - ${chapter.path}`),
		'',
		'format: typst',
		'',
	].join('\n');
	const target = vscode.Uri.joinPath(folder, manuscriptDirectory);
	const staging = vscode.Uri.joinPath(folder, `.${manuscriptDirectory}-${crypto.randomUUID()}`);
	const fs = vscode.workspace.fs;
	const encoder = new TextEncoder();
	await fs.createDirectory(staging);
	try {
		for (const chapter of chapters) {
			const heading = `# ${chapter.title}${chapter.unnumbered ? ' {.unnumbered}' : ''}\n\n`;
			await fs.writeFile(vscode.Uri.joinPath(staging, chapter.path), encoder.encode(heading));
		}
		await fs.writeFile(vscode.Uri.joinPath(staging, configNames[0]), encoder.encode(config));
		await fs.rename(staging, target, { overwrite: false });
	} catch (error) {
		try {
			await fs.delete(staging, { recursive: true });
		} catch {
			// Report the original creation failure if cleanup also fails.
		}
		throw error;
	}
}

function parseYaml(source: string): Record<string, unknown> | undefined {
	try {
		return asRecord(load(source, { schema: JSON_SCHEMA }));
	} catch {
		return undefined;
	}
}

/** Reads chapter files in book order, including chapters grouped under parts. */
function chapterPaths(book: Record<string, unknown>): Set<string> {
	const paths = new Set<string>();
	const visited = new Set<unknown[]>();
	const collect = (entries: unknown) => {
		if (!Array.isArray(entries) || visited.has(entries)) {
			return;
		}
		visited.add(entries);
		for (const entry of entries) {
			const part = asRecord(entry);
			const path = asText(part ? part.part : entry);
			if (path && /\.(?:qmd|md)$/i.test(path)) {
				paths.add(path);
			}
			collect(part?.chapters);
		}
	};
	collect(book.chapters);
	collect(book.appendices);
	return paths;
}

function chapterTitle(source: string): string | undefined {
	const frontMatter = /^---[^\S\r\n]*\r?\n(?<yaml>[\s\S]*?)^---[^\S\r\n]*(?:\r?\n|$)/m.exec(source);
	const metadata = frontMatter?.index === 0 ? frontMatter : undefined;
	const title = metadata?.groups && asText(parseYaml(metadata.groups.yaml)?.title);
	const markdown = metadata ? source.slice(metadata[0].length) : source;
	const heading = /^#[\t ]+(?<title>[^\r\n]+)/m.exec(markdown)?.groups?.title;
	return title ?? asText(heading?.replace(/\s+#+\s*$/, '').replace(/\s+\{[^{}]*\}\s*$/, ''));
}

/** Loads a Quarto book without executing anything from the project. */
export async function loadManuscript(folder: vscode.Uri) {
	const directory = vscode.Uri.joinPath(folder, manuscriptDirectory);
	const decoder = new TextDecoder();
	try {
		const [config, alternate] = configNames.map(name => vscode.Uri.joinPath(directory, name));
		const bytes = await readOptionalFile(config) ?? await readOptionalFile(alternate);
		const metadata = bytes && parseYaml(decoder.decode(bytes));
		const book = asRecord(metadata?.book);
		if (asRecord(metadata?.project)?.type !== 'book' || !book) {
			return undefined;
		}
		const chapters = await Promise.all(Array.from(chapterPaths(book), async path => {
			const uri = projectResource(directory, path);
			const bytes = uri && await readOptionalFile(uri).catch(() => undefined);
			return uri && bytes ? { path, uri, title: chapterTitle(decoder.decode(bytes)) ?? path } : undefined;
		}));
		return { directory, title: asText(book.title), chapters: chapters.filter(chapter => chapter !== undefined) };
	} catch {
		return undefined;
	}
}
