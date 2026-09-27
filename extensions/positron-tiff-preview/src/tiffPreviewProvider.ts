/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Read-only custom editor that shows TIFF and OME-TIFF files in a webview.
 *
 * The webview reads the file itself through its webview URI. The webview
 * resource loader answers HTTP Range requests by reading only the requested
 * bytes, so a large file is never loaded whole. The webview also gets the file
 * size, so that no request goes past the end of the file.
 */
export class TiffPreviewProvider implements vscode.CustomReadonlyEditorProvider {

	public static readonly viewType = 'positronTiffPreview.previewEditor';

	constructor(private readonly _extensionUri: vscode.Uri) { }

	public openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
		return { uri, dispose: () => { } };
	}

	public async resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
		const webview = webviewPanel.webview;
		const mediaUri = vscode.Uri.joinPath(this._extensionUri, 'media');
		webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(document.uri, '..').with({ query: '', fragment: '' }),
				mediaUri,
			],
		};
		const { size } = await vscode.workspace.fs.stat(document.uri);
		webview.html = getHtml(webview, mediaUri, document.uri, size);
	}
}

/**
 * Builds the webview HTML. The viewer script is the only script the page loads.
 * It needs 'wasm-unsafe-eval' because Viv decodes LZW with an inline WebAssembly
 * module.
 */
function getHtml(webview: vscode.Webview, mediaUri: vscode.Uri, resource: vscode.Uri, size: number): string {
	const src = webview.asWebviewUri(resource).toString();
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'viewer.js')).toString();
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'viewer.css')).toString();
	return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource} 'wasm-unsafe-eval'; style-src ${webview.cspSource}; connect-src ${webview.cspSource};">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="stylesheet" href="${escapeAttribute(styleUri)}">
</head>
<body data-src="${escapeAttribute(src)}" data-size="${size}">
	<div id="error" hidden>
		<p>${vscode.l10n.t("An error occurred while loading the TIFF file.")}</p>
	</div>
	<div id="viewer"></div>
	<script type="module" src="${escapeAttribute(scriptUri)}"></script>
</body>
</html>`;
}

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
