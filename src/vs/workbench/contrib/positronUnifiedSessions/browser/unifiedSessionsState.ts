/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IUnifiedSessionsRevealRequest, IUnifiedSessionsState, UNIFIED_SESSIONS_ENABLED_KEY } from '../common/unifiedSessions.js';

/**
 * UnifiedSessionsState class.
 */
export class UnifiedSessionsState extends Disposable implements IUnifiedSessionsState {
	declare readonly _serviceBrand: undefined;

	private _selectedTerminalId: number | undefined;
	private _order: readonly string[] = [];

	private readonly _onDidChangeSelection = this._register(new Emitter<number | undefined>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;

	private readonly _onDidChangeOrder = this._register(new Emitter<void>());
	readonly onDidChangeOrder = this._onDidChangeOrder.event;

	private readonly _onDidRequestReveal = this._register(new Emitter<IUnifiedSessionsRevealRequest>());
	readonly onDidRequestReveal = this._onDidRequestReveal.event;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
	}

	get enabled(): boolean {
		return this._configurationService.getValue<boolean>(UNIFIED_SESSIONS_ENABLED_KEY) === true;
	}

	get selectedTerminalId(): number | undefined {
		return this._selectedTerminalId;
	}

	get order(): readonly string[] {
		return this._order;
	}

	setOrder(order: readonly string[]): void {
		this._order = order;
		this._onDidChangeOrder.fire();
	}

	selectTerminal(instanceId: number | undefined): void {
		if (this._selectedTerminalId === instanceId) {
			return;
		}
		this._selectedTerminalId = instanceId;
		this._onDidChangeSelection.fire(instanceId);
	}

	requestReveal(focus: boolean): void {
		this._onDidRequestReveal.fire({ focus });
	}
}
