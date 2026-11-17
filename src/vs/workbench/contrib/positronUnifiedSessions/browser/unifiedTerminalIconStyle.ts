/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cssJs from '../../../../base/browser/cssValue.js';
import * as domStylesheetsJs from '../../../../base/browser/domStylesheets.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { isDark } from '../../../../platform/theme/common/theme.js';
import { IThemeService, Themable } from '../../../../platform/theme/common/themeService.js';
import { ITerminalGroupService, ITerminalService } from '../../terminal/browser/terminal.js';
import { getColorClass, getUriClasses } from '../../terminal/browser/terminalIcon.js';

/**
 * UnifiedTerminalIconStyle class. Writes the styles that give each terminal's
 * tab its custom color and image icon. The Terminal view does the same for
 * its own tabs with a class it does not export, so this is a copy of it.
 */
export class UnifiedTerminalIconStyle extends Themable {
	private readonly _styleElement: HTMLElement;

	constructor(
		container: HTMLElement,
		@IThemeService private readonly _themeService: IThemeService,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ITerminalGroupService private readonly _terminalGroupService: ITerminalGroupService,
	) {
		super(_themeService);
		this._register(this._terminalService.onAnyInstanceIconChange(() => this.updateStyles()));
		this._register(this._terminalService.onDidChangeInstances(() => this.updateStyles()));
		this._register(this._terminalGroupService.onDidChangeGroups(() => this.updateStyles()));
		this._styleElement = domStylesheetsJs.createStyleSheet(container);
		this._register(toDisposable(() => this._styleElement.remove()));
		this.updateStyles();
	}

	override updateStyles(): void {
		super.updateStyles();
		const colorTheme = this._themeService.getColorTheme();
		let css = '';

		// Image icons.
		for (const instance of this._terminalService.instances) {
			const icon = instance.icon;
			if (!icon) {
				continue;
			}
			let uri: URI | undefined;
			if (icon instanceof URI) {
				uri = icon;
			} else if (icon instanceof Object && hasKey(icon, { light: true, dark: true })) {
				uri = isDark(colorTheme.type) ? icon.dark : icon.light;
			}
			const iconClasses = getUriClasses(instance, colorTheme.type);
			if (uri instanceof URI && iconClasses && iconClasses.length > 1) {
				css += `.monaco-workbench .${iconClasses[0]} .monaco-highlighted-label .codicon{background-image: ${cssJs.asCSSUrl(uri)};}`;
			}
		}

		// Colors. The icon is the first codicon of the element that carries the class.
		for (const instance of this._terminalService.instances) {
			const colorClass = getColorClass(instance);
			if (!colorClass || !instance.color) {
				continue;
			}
			const color = colorTheme.getColor(instance.color);
			if (color) {
				css += `.monaco-workbench .${colorClass} .codicon:first-child:not(.codicon-trashcan):not(.file-icon){ color: ${color} !important; }`;
			}
		}

		this._styleElement.textContent = css;
	}
}
