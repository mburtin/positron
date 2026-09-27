/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/
import * as path from 'node:path';
import { run } from '../esbuild-webview-common.mts';

const srcDir = path.join(import.meta.dirname, 'viewer-src');
const outDir = path.join(import.meta.dirname, 'media');

run({
	entryPoints: {
		'viewer': path.join(srcDir, 'index.ts'),
	},
	srcDir,
	outdir: outDir,
}, process.argv);
