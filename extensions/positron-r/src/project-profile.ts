/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Files that mark the directory of an R environment (renv and rv use
 * `.Rprofile`, rig uses `.Renviron`). Same criterion as Ark's `source()`
 * anchoring (`ENVIRONMENT_SENTINELS` in `oak_scan`).
 */
const ENVIRONMENT_SENTINELS = ['.Rprofile', '.Renviron'];

function isEnvironmentDir(dir: string): boolean {
	return ENVIRONMENT_SENTINELS.some(sentinel => fs.existsSync(path.join(dir, sentinel)));
}

/**
 * R only reads the `.Rprofile` of its working directory (or of the home
 * directory). Notebook sessions start in the notebook's folder, so they miss
 * the profile of a project above it, such as the one that activates renv or rv.
 *
 * Returns the `.Rprofile` of the nearest environment directory between
 * `workingDirectory` (excluded) and `rootDirectory`, if it has one.
 */
export function findProjectRProfile(workingDirectory: string, rootDirectory: string, homeDirectory = os.homedir()): string | undefined {
	const relative = path.relative(rootDirectory, workingDirectory);
	if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		return undefined;
	}
	if (isEnvironmentDir(workingDirectory)) {
		return undefined;
	}

	// Walk up from the parent of `workingDirectory` to `rootDirectory`
	const segments = relative.split(path.sep);
	for (let depth = segments.length - 1; depth >= 0; depth--) {
		const dir = path.join(rootDirectory, ...segments.slice(0, depth));
		if (!isEnvironmentDir(dir)) {
			continue;
		}

		// A `.Renviron` alone (rig) can't be loaded after startup. R already
		// falls back to the home profile on its own.
		const profile = path.join(dir, '.Rprofile');
		if (!fs.existsSync(profile) || path.relative(homeDirectory, dir) === '') {
			return undefined;
		}
		return profile;
	}
	return undefined;
}
