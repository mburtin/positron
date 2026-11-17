/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Action2, MenuId, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { POSITRON_CONSOLE_VIEW_ID } from '../../../services/positronConsole/browser/interfaces/positronConsoleService.js';
import { ITerminalGroupService, ITerminalService } from '../../terminal/browser/terminal.js';
import { UnifiedTerminalSelectedContext } from '../common/unifiedSessions.js';

/**
 * Splits the terminal the unified view is showing. It is in the title bar of
 * the view while a terminal is showing, as the Terminal view's own split
 * button is in the title bar of that view.
 */
registerAction2(class SplitUnifiedTerminalAction extends Action2 {
	constructor() {
		super({
			id: 'positron.unifiedSessions.splitTerminal',
			title: localize2('positron.unifiedSessions.splitTerminal', "Split Terminal"),
			icon: Codicon.splitHorizontal,
			f1: false,
			precondition: UnifiedTerminalSelectedContext,
			menu: {
				id: MenuId.ViewTitle,
				group: 'navigation',
				order: 5,
				when: ContextKeyExpr.and(
					ContextKeyExpr.equals('view', POSITRON_CONSOLE_VIEW_ID),
					UnifiedTerminalSelectedContext
				),
			},
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const activeInstance = accessor.get(ITerminalGroupService).activeInstance;
		if (activeInstance) {
			await accessor.get(ITerminalService).createTerminal({ location: { parentTerminal: activeInstance } });
		}
	}
});
