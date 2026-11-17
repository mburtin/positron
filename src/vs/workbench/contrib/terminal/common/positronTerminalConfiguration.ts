/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IProcessEnvironment } from '../../../../base/common/platform.js';
import { ConfigurationScope, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';

/**
 * Setting that replaces the user's prompt customizations (oh-my-zsh themes, powerlevel10k,
 * starship, oh-my-posh, a custom PS1, ...) with a standard prompt in the integrated terminal.
 */
export const STANDARD_PROMPT_SETTING_KEY = 'terminal.integrated.standardPrompt';

/**
 * Environment variable read by the shell integration scripts (zsh and bash) to know whether to
 * apply the standard prompt.
 */
export const STANDARD_PROMPT_ENV_VAR = 'POSITRON_STANDARD_PROMPT';

/**
 * Registers the Positron-specific integrated terminal settings.
 */
export function registerPositronTerminalConfiguration(): void {
	Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
		id: 'terminal',
		order: 100,
		title: localize('positron.terminalIntegratedConfigurationTitle', "Integrated Terminal"),
		type: 'object',
		properties: {
			[STANDARD_PROMPT_SETTING_KEY]: {
				markdownDescription: localize(
					'positron.terminal.integrated.standardPrompt',
					"Controls whether the integrated terminal replaces the prompt customizations from your shell startup files (oh-my-zsh themes, powerlevel10k, starship, oh-my-posh, a custom `PS1`, ...) with a standard prompt. The rest of your shell configuration (aliases, `PATH`, plugins) is still loaded. Applies to zsh and bash when {0} is enabled, in newly created terminals.",
					`\`#terminal.integrated.shellIntegration.enabled#\``
				),
				type: 'boolean',
				default: true,
				scope: ConfigurationScope.APPLICATION,
			},
		},
	});
}

/**
 * Adds the environment variable that tells the shell integration scripts to apply the standard
 * prompt, or removes it when the setting is off so a value inherited from a parent process is
 * not picked up.
 * @param env The terminal process environment, modified in place.
 * @param enabled The value of {@link STANDARD_PROMPT_SETTING_KEY}.
 */
export function applyStandardPromptEnvironment(env: IProcessEnvironment, enabled: boolean): void {
	if (enabled) {
		env[STANDARD_PROMPT_ENV_VAR] = '1';
	} else {
		delete env[STANDARD_PROMPT_ENV_VAR];
	}
}
