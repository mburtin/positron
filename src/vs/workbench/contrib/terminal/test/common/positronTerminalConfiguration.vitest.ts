/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProcessEnvironment } from '../../../../../base/common/platform.js';
import { applyStandardPromptEnvironment, STANDARD_PROMPT_ENV_VAR } from '../../common/positronTerminalConfiguration.js';

describe('applyStandardPromptEnvironment', () => {
	it('sets the variable read by the shell integration scripts when enabled', () => {
		const env: IProcessEnvironment = { PATH: '/usr/bin' };
		applyStandardPromptEnvironment(env, true);
		expect(env).toEqual({ PATH: '/usr/bin', [STANDARD_PROMPT_ENV_VAR]: '1' });
	});

	it('removes a value inherited from the parent process when disabled', () => {
		const env: IProcessEnvironment = { PATH: '/usr/bin', [STANDARD_PROMPT_ENV_VAR]: '1' };
		applyStandardPromptEnvironment(env, false);
		expect(env).toEqual({ PATH: '/usr/bin' });
	});
});
